//@ts-check
'use strict';

const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

/** @type {import('webpack').Configuration} */
const config = {
    target: 'node',            // VS Code extensions run in Node.js
    mode: 'production',        // Enables minification + tree-shaking

    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
    },

    externals: {
        vscode: 'commonjs vscode',  // vscode module is provided by the runtime
    },

    resolve: {
        extensions: ['.ts', '.js'],
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [{ loader: 'ts-loader' }],
            },
        ],
    },

    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    // ── SECURITY: Mangle all variable/function names ──
                    mangle: {
                        toplevel: true,         // Mangle top-level names
                        properties: {
                            regex: /^_/,        // Mangle _private properties
                        },
                    },
                    compress: {
                        drop_console: false,     // Keep console.log for debugging
                        passes: 2,              // Extra optimization passes
                    },
                    output: {
                        comments: false,         // Strip all comments
                        ascii_only: true,        // Safe encoding
                    },
                },
                extractComments: false,
            }),
        ],
    },

    devtool: false,  // No source maps in production — prevents de-obfuscation
};

module.exports = config;
