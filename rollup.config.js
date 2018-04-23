import nodeResolve from "rollup-plugin-node-resolve";

export default {
    input: "js/src/app.js",
    output: {
        file: "js/app.js",
        format: "iife",
    },
    plugins: [
        nodeResolve()
    ]
};
