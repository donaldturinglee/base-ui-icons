import fs from "node:fs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const input = "build/react/index.ts";
const outDir = "lib";
const external = ["react"];

function clean() {
  return {
    name: "clean",
    buildStart() {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  };
}

export default [
  {
    input,
    external,
    plugins: [
      clean(),
      typescript({
        tsconfig: "./tsconfig.json",
        compilerOptions: {
          noEmit: false,
          declaration: false
        }
      })
    ],
    output: [
      {
        file: `${outDir}/react/index.js`,
        format: "cjs",
        exports: "named",
        interop: "auto"
      },
      {
        file: `${outDir}/react/index.mjs`,
        format: "es"
      }
    ]
  },
  {
    input,
    external,
    plugins: [dts()],
    output: [
      {
        file: `${outDir}/react/index.d.ts`,
        format: "es"
      },
      {
        file: `${outDir}/react/index.d.mts`,
        format: "es"
      }
    ]
  }
];
