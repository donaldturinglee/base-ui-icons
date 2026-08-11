import fs from "node:fs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const input = "build/index.ts";
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
        file: `${outDir}/index.js`,
        format: "cjs",
        exports: "named",
        interop: "auto"
      },
      {
        file: `${outDir}/index.mjs`,
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
        file: `${outDir}/index.d.ts`,
        format: "es"
      },
      {
        file: `${outDir}/index.d.mts`,
        format: "es"
      }
    ]
  }
];
