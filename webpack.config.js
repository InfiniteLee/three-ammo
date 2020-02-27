const path = require("path");
const webpack = require("webpack");

module.exports = (env, argv) => ({
  node: {
    fs: "empty"
  },
  entry:
    argv.mode === "production"
      ? "./index.js"
      : {
          example: "./examples/example.js",
          sabexample: "./examples/sabexample.js",
          stress: "./examples/stress.js",
          sabstress: "./examples/sabstress.js",
          transferablestress: "./examples/transferablestress.js"
        },
  output: {
    path: argv.mode === "production" ? path.resolve(__dirname, "dist") : path.resolve(__dirname, "examples"),
    publicPath: "/examples/",
    filename: argv.mode === "production" ? "threeammo.js" : "[name].js"
  },
  plugins: [new webpack.ProvidePlugin({ THREE: "three" })],
  devtool: argv.mode === "production" ? "source-map" : "inline-source-map",
  devServer: {
    host: "0.0.0.0",
    port: "8888"
  },
  module: {
    rules: [
      {
        test: /\.worker\.js$/,
        loader: "worker-loader",
        options: {
          name: "[name]-[hash].js",
          publicPath: "/",
          inline: true
        }
      },
      {
        test: /\.(wasm)$/,
        type: "javascript/auto",
        use: {
          loader: "file-loader",
          options: {
            outputPath: "dist",
            name: "[name]-[hash].[ext]"
          }
        }
      }
    ]
  }
});
