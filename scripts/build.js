const fs = require('fs-extra')
const path = require('path')
const cheerio = require('cheerio')
const {parseSync} = require('svgson')
const yargs = require('yargs')
const merge = require('lodash.merge')
const {default: generate} = require('@babel/generator')
const t = require('@babel/types')

// Main CLI
const {argv} = yargs(process.argv.slice(2))
  .usage('Usage: $0 <command> [options]')
  .command('generate-data', 'Generate JSON data from SVG files', {
    input: {
      alias: 'i',
      type: 'array',
      demandOption: true,
      describe: 'Input SVG files'
    },
    output: {
      alias: 'o',
      type: 'string',
      describe: 'Output JSON file. Defaults to stdout if no output file is provided.'
    },
    keywords: {
      alias: 'k',
      type: 'string',
      default: './keywords.json',
      describe: 'Keywords JSON file path'
    }
  })
  .command('generate-icons', 'Generate React icon components from JSON data', {
    input: {
      alias: 'i',
      type: 'string',
      demandOption: true,
      describe: 'Input JSON data file'
    },
    output: {
      alias: 'o',
      type: 'string',
      default: './lib',
      describe: 'Output directory for generated files'
    }
  })
  .demandCommand(1, 'You need to specify a command')
  .help()

// ============================================================================
// Task 1: Generate JSON data from SVG files
// ============================================================================
async function generateData(options) {
  const {globby} = await import('globby')
  const {trimNewlines} = await import('trim-newlines')
  
  const keywords = fs.existsSync(options.keywords) 
    ? require(path.resolve(options.keywords)) 
    : {}

  // The `options.input` array could contain globs (e.g. "**/*.svg").
  const filepaths = await globby(options.input)
  const svgFilepaths = filepaths.filter(filepath => path.parse(filepath).ext === '.svg')

  if (svgFilepaths.length === 0) {
    console.error('No input SVG file(s) found')
    process.exit(1)
  }

  let exitCode = 0

  const icons = svgFilepaths.map(filepath => {
    try {
      const filename = path.parse(filepath).base
      const filenamePattern = /(.+)_([0-9]+).svg$/

      if (!filenamePattern.test(filename)) {
        throw new Error(
          `${filename}: Invalid filename. Please append the height of the SVG to the end of the filename (e.g. alert_16.svg).`
        )
      }

      const [, name, height] = filename.match(filenamePattern)
      const svg = fs.readFileSync(path.resolve(filepath), 'utf8')
      const svgElement = cheerio.load(svg)('svg')
      const svgWidth = parseInt(svgElement.attr('width'))
      const svgHeight = parseInt(svgElement.attr('height'))
      const svgViewBox = svgElement.attr('viewBox')
      const svgPath = trimNewlines(svgElement.html()).trim()
      const ast = parseSync(svg, {
        camelcase: true,
        transformNode: (node) => {
          // Replace '#000' with 'currentColor' in all attributes
          if (node.attributes) {
            Object.keys(node.attributes).forEach(key => {
              if (node.attributes[key] === '#000') {
                node.attributes[key] = 'currentColor'
              }
            })
          }
          return node
        }
      })

      if (!svgWidth) {
        throw new Error(`${filename}: Missing width attribute.`)
      }

      if (!svgHeight) {
        throw new Error(`${filename}: Missing height attribute.`)
      }

      if (!svgViewBox) {
        throw new Error(`${filename}: Missing viewBox attribute.`)
      }

      if (svgHeight !== parseInt(height)) {
        throw new Error(`${filename}: Height in filename does not match height attribute of SVG`)
      }

      const viewBoxPattern = /0 0 ([0-9]+) ([0-9]+)/

      if (!viewBoxPattern.test(svgViewBox)) {
        throw new Error(
          `${filename}: Invalid viewBox attribute. The viewBox attribute should be in the following format: "0 0 <width> <height>"`
        )
      }

      const [, viewBoxWidth, viewBoxHeight] = svgViewBox.match(viewBoxPattern)

      if (svgWidth !== parseInt(viewBoxWidth)) {
        throw new Error(`${filename}: width attribute and viewBox width do not match.`)
      }

      if (svgHeight !== parseInt(viewBoxHeight)) {
        throw new Error(`${filename}: height attribute and viewBox height do not match.`)
      }

      return {
        name,
        keywords: keywords[name] || [],
        width: svgWidth,
        height: svgHeight,
        path: svgPath,
        ast
      }
    } catch (error) {
      console.error(error)
      exitCode = 1
      return null
    }
  })

  // Exit early if any errors occurred.
  if (exitCode !== 0) {
    process.exit(exitCode)
  }

  const iconsByName = icons.reduce(
    (acc, icon) =>
      merge(acc, {
        [icon.name]: {
          name: icon.name,
          keywords: icon.keywords,
          heights: {
            [icon.height]: {
              width: icon.width,
              path: icon.path,
              ast: icon.ast
            }
          }
        }
      }),
    {}
  )

  if (options.output) {
    fs.outputJsonSync(path.resolve(options.output), iconsByName)
    console.log(`Generated ${options.output}`)
  } else {
    process.stdout.write(JSON.stringify(iconsByName))
  }
}

// ============================================================================
// Task 2: Generate React icon components from JSON data
// ============================================================================
function pascalCase(str) {
  return str.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase())
}

/**
 * Convert a given node from an svg AST into a JS AST of JSX Elements
 */
function svgToJSX(node) {
  if (node.type === 'element') {
    const children = node.children.map(svgToJSX)

    if (node.name === 'svg') {
      if (children.length === 0) {
        throw new Error(`No children available for icon`)
      }

      if (children.length > 1) {
        return t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), children)
      }

      return children[0]
    }

    const attrs = Object.entries(node.attributes).map(([key, value]) => {
      if (typeof value !== 'string') {
        throw new Error(`Unknown value type: ${value}`)
      }
      return t.jsxAttribute(t.jsxIdentifier(key), t.stringLiteral(value))
    })
    const openingElement = t.jsxOpeningElement(t.jsxIdentifier(node.name), attrs, children.length === 0)
    const closingElement = t.jsxClosingElement(t.jsxIdentifier(node.name))

    if (children.length > 0) {
      return t.jsxElement(openingElement, closingElement, children, false)
    }

    return t.jsxElement(openingElement, closingElement, [], true)
  }

  throw new Error(`Unknown type: ${node.type}`)
}

function writeIcons(file, icons) {
  const count = icons.length
  const code = `import React from "react";
import type { IconProps, SVGData } from "./Icon.types";
import { classNames } from "@/lib/classnames";

function createIconComponent(name: string, defaultClassName: string, getSVGData: () => SVGData) {
    const svgDataByHeight = getSVGData()
    const heights = Object.keys(svgDataByHeight)

    const Icon = React.forwardRef<SVGSVGElement, IconProps>(
        (
            {
                "aria-label": ariaLabel,
                "aria-labelledby": arialabelledby,
                tabIndex,
                className = "",
                fill = "currentColor",
                size = 16,
                id,
                title,
                style,
                ...rest
            },
            ref,
        ) => {
            const height = size
            const naturalHeight = closestNaturalHeight(heights, height)
            const naturalWidth = svgDataByHeight[naturalHeight].width
            const width = height * (naturalWidth / parseInt(naturalHeight, 10))
            const path = svgDataByHeight[naturalHeight].path
            const labelled = ariaLabel || arialabelledby
            const role = labelled ? "img" : undefined
            const classes = classNames(defaultClassName, className)

            return (
                <svg
                    ref={ref}
                    {...rest}
                    aria-hidden={labelled ? undefined : "true"}
                    tabIndex={tabIndex}
                    focusable={(tabIndex ?? -1) >= 0 ? "true" : "false"}
                    aria-label={ariaLabel}
                    aria-labelledby={arialabelledby}
                    className={classes}
                    role={role}
                    viewBox={\`0 0 \${naturalWidth} \${naturalHeight}\`}
                    width={width}
                    height={height}
                    fill={fill}
                    id={id}
                    display="inline-block"
                    overflow="visible"
                    style={style}
                >
                    {title ? <title>{title}</title> : null}
                    {path}
                </svg>
            )
        },
    )

    Icon.displayName = name

    return Icon
}

function closestNaturalHeight(naturalHeights: string[], height: number): string {
    const closestHeight = naturalHeights
        .map((naturalHeight) => parseInt(naturalHeight, 10))
        .reduce((acc, naturalHeight) => (naturalHeight <= height ? naturalHeight : acc), parseInt(naturalHeights[0], 10))
    return closestHeight.toString()
}

${icons.map(({code}) => code.replace('const ', 'export const ')).join('\n\n')}
`
  return fs.writeFile(file, code, 'utf8').then(() => {
    console.log('Wrote %s with %d exports', file, count)
    return icons
  })
}

function writeTypes(file, icons) {
  const count = icons.length
  const code = `import React, { ReactNode } from "react";

export type SVGData = {
    [height: string]: {
        /**
         * Width of the SVG at this height
         */
        width: number;
        /**
         * SVG path content
         */
        path: ReactNode;
    };
};

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
    /**
     * Accessible label for the icon
     */
    "aria-label"?: string;
    /**
     * ID of element that labels the icon
     */
    "aria-labelledby"?: string;
    /**
     * Additional CSS class names
     */
    className?: string;
    /**
     * Fill color for the icon
     */
    fill?: string;
    /**
     * Icon size (number in pixels)
     */
    size?: number;
    /**
     * Icon title for accessibility
     */
    title?: string;
}
`
  return fs.writeFile(file, code, 'utf8').then(() => {
    console.log('Wrote %s with %d exports', file, count)
    return icons
  })
}

function writeIndex(file, icons) {
  const count = icons.length
  const code = `import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { IconProps } from "./Icon.types";

export type { IconProps } from "./Icon.types";
export type Icon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

${icons.map(({name}) => `export { ${name} } from "./Icon";`).join('\n')}
`
  return fs.writeFile(file, code, 'utf8').then(() => {
    console.log('Wrote %s with %d exports', file, count)
    return icons
  })
}

async function generateIcons(options) {
  const octicons = require(path.resolve(options.input))
  const srcDir = path.resolve(options.output)
  const iconsFile = path.join(srcDir, 'Icon.tsx')
  const typesFile = path.join(srcDir, 'Icon.types.ts')
  const indexFile = path.join(srcDir, 'index.ts')

  const icons = Object.entries(octicons)
    .map(([key, octicon]) => {
      const name = `${pascalCase(key)}Icon`
      
      const svgData = t.objectExpression(
        Object.entries(octicon.heights).map(([height, icon]) => {
          return t.objectProperty(
            t.stringLiteral(height),
            t.objectExpression([
              t.objectProperty(t.stringLiteral('width'), t.numericLiteral(icon.width)),
              t.objectProperty(t.stringLiteral('path'), svgToJSX(icon.ast))
            ])
          )
        })
      )
      
      const {code} = generate(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(name),
            t.addComment(
              t.callExpression(t.identifier('createIconComponent'), [
                t.stringLiteral(name),
                t.stringLiteral(`icon icon-${key}`),
                t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(svgData)]))
              ]),
              'leading',
              '#__PURE__'
            )
          )
        ])
      )
      
      // Convert 2-space indentation to 4-space indentation
      const formattedCode = code.split('\n').map(line => {
        const leadingSpaces = line.match(/^(\s*)/)[0].length
        const indent = ' '.repeat((leadingSpaces / 2) * 4)
        return indent + line.trimStart()
      }).join('\n')

      return {
        key,
        name,
        octicon,
        code: formattedCode
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key))

  await fs.mkdirs(srcDir)
  await writeIcons(iconsFile, icons)
  await writeTypes(typesFile, icons)
  await writeIndex(indexFile, icons)
  
  console.log('Icon generation complete!')
}

// ============================================================================
// Main execution
// ============================================================================
async function main() {
  const command = argv._[0]

  try {
    switch (command) {
      case 'generate-data':
        await generateData(argv)
        break
      case 'generate-icons':
        await generateIcons(argv)
        break
      default:
        console.error(`Unknown command: ${command}`)
        process.exit(1)
    }
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

main()
