import {CommonParameters, ParseResult} from "./common";
import {Command, CommandInput, CommandOutput} from "../cmd";
import axios from "axios";
import vm from "vm";
import chalk from "chalk";
import path from "path";
import fs from "fs";
import crypto from "crypto";

export interface SolCompilerParameters extends CommonParameters {
    readonly version?: string;
    readonly outputFile?: string;
}

export function parseCompilerArguments(output: CommandOutput, args: string[]): ParseResult<SolCompilerParameters> {
    const console = output;

    let version: string = undefined;
    let outputFile: string = undefined;

    for(let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case "-cv":
            case "--sol-version":
                const versionString = args[++i]

                if (!versionString || !versionString.match(/^\d+\.\d+\.\d+(-[a-zA-Z0-9._-]+)?(\+(-[a-zA-Z0-9._-]+))?$/)) {
                    console.error("Invalid compiler version number:", versionString, "- please specify a valid (semantic) version string, like 0.8.11 or 0.7.5-test1.");
                    return { exit: 1 };
                }

                version = versionString;
                break;

            case "-o":
            case "--output":
                outputFile = args[++i];
                break;
        }
    }

    return {
        model: {
            showHelp: false,
            version: version,
            outputFile: outputFile
        }
    }
}

export function solCompilerHelp(output: CommandOutput) {
    output.log("  --sol-version / -cv <version>  Sets the version of the Solidity compiler to use.");
    output.log("                                 A list of supported versions can be found below.")
    output.log("  --output / -o <file>           Writes the output to a file instead of STDOUT.");
}

export async function solCompilerVersions(output: CommandOutput) {
    output.log("Supported versions (for --sol-version / -cv):")

    const builds = await loadAssetList();

    for (const release of builds.sort((a,b) => -1 * a.version.localeCompare(b.version))) {
        output.log("  ", chalk.magenta(release.version), "\t", chalk.dim(release.path));
    }
}

async function loadAssetList(): Promise<{
    "path": string,
    "version":string,
    "build": string,
    "longVersion": string,
    "keccak256": string,
    "sha256": string,
    "urls": string[]
}[]>
{
    const { builds } =  JSON.parse(await loadAsset("list.json", true));
    return builds;
}

async function loadAsset(asset: string, forceReload?: boolean): Promise<string> {
    // noinspection JSDeprecatedSymbols
    const platform = process.platform;

    const appdata = process.env.APPDATA || (platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
    const cacheDir = path.join(appdata, platform == "win32" ? "XyrusWorx": "xyrusworx", "web3-cli", "solc-cache");

    fs.mkdirSync(cacheDir, { recursive: true });

    const cacheFile = path.join(cacheDir, asset);
    const url = `https://binaries.soliditylang.org/bin/${asset}`;

    if (!forceReload && fs.existsSync(cacheFile)) {
        return fs.readFileSync(cacheFile).toString();
    }
    else {
        try {
            return await new Promise<string>((resolve, reject) => {
                axios.get(url,  { responseType: 'text' })
                    .then(result => {
                        fs.writeFileSync(cacheFile, result.data);
                        resolve(result.data);
                    })
                    .catch(err => reject(err));
            });
        }
        catch(e) {
            if (fs.existsSync(cacheFile)) {
                return fs.readFileSync(cacheFile).toString();
            }
            throw e;
        }
    }
}

export abstract class CompilerCommand implements Command {

    protected constructor(
        protected input: CommandInput,
        protected output: CommandOutput) {}
    abstract run(args: string[]): Promise<number>;

    protected async createCompiler(version?: string): Promise<any> {

        const console = this.output;

        console.debug('Obtaining list of compiler versions...');
        const builds = await loadAssetList();
        let release;

        if (!!version) {
            if (!builds || !(release = builds.find(x => x.version == version))) {
                throw 'Unsupported compiler version: ' + version;
            }
        }
        else {
            if (!builds || !builds.length) {
                throw 'Unable to determine latest compiler version.';
            }
            release = builds.sort((a,b) => a.version.localeCompare(b.version) * -1)[0];
        }

        console.log('Fetching exact compiler version:');
        console.log('   Version:', release.version)
        console.log('   Build:  ', release.build)
        console.log('   SHA-256:', release.sha256);

        const data = await loadAsset(release.path);
        const hash = crypto.createHash('sha256').update(data).digest('hex');

        console.debug('Verifying hash code...');

        if (hash.toLowerCase() != release.sha256.replace(/^0[xX]/, '').toLowerCase()) {
            throw 'Failed to verify compiler version ' + release.version + ". Supplied hash: " + hash;
        }

        console.debug('Creating compiler instance in isolated context...');

        const mod = vm.runInContext(data + "\n\nModule;", vm.createContext({Buffer, process, __dirname}), { filename: release.path });
        const wrp = require('solc/wrapper');

        console.debug('Compiler ready!');

        return wrp(mod);
    }

    protected async compile(compiler: { compile: (string) => any }, input: any) {

        const console = this.output;
        console.log('Compiling...');

        const solcOutput = JSON.parse(await compiler.compile(JSON.stringify(input)));

        await new Promise<void>((res,rej) => {
            if (!!solcOutput?.errors) {
                const err = solcOutput.errors;
                if (err.length > 0) {
                    err.forEach(x => {
                        let fn, q;
                        switch (x.severity || 'error') {
                            case 'error':
                                fn = console.error;
                                q = true;
                                break;
                            case 'warning':
                            case 'warn':
                                fn = console.warn;
                                break;
                        }
                        if (!!fn) fn.call(console, x.formattedMessage || x.message || x);
                        if (!!q) rej("Compilation failed.");
                    });
                }
            }
            res();
        });

        console.log('Compilation successful.');

        return solcOutput;
    }
}
