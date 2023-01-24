import {CommandInput, CommandOutput} from "../cmd";
import {commonHelp, parseArguments} from "../shared/common";
import {
    CompilerCommand,
    parseCompilerArguments,
    solCompilerHelp,
    SolCompilerParameters,
    solCompilerVersions
} from "../shared/compiler";
import {readAllStdin} from "../console";
import fs from "fs";
import chalk from "chalk";

// noinspection JSUnusedGlobalSymbols
export default class LayoutCommand extends CompilerCommand {
    constructor(inp: CommandInput, out: CommandOutput) {super(inp, out)}

    public async run(args: string[]): Promise<number> {
        const { exit, model } = parseArguments<SolCompilerParameters>(this.output, args, parseCompilerArguments);

        if (!!model?.showHelp) {
            await this.usage();
            return exit || 0;
        }
        if (exit !== undefined)
            return exit || 0;


        let fromStdin: boolean = false;

        for(let i = 0; i < args.length; i++) {
            const arg = args[i];
            switch (arg) {
                case "-i":
                case "--stdin":
                    fromStdin = true;
                    break;
            }
        }

        let data: string = fromStdin
            ? await readAllStdin(process.stdin)
            : args[args.length - 1];

        let solcInput ;try {
            try {
                solcInput = JSON.parse(data);
            }
            catch {
                solcInput = {
                    language: "Solidity",
                    sources: {
                        "input.sol": {
                            content: data
                        }
                    }
                }
            }
        }
        catch(e) {
            this.output.error("Failed to process input. Please supply wither valid standard Solidity input JSON or a Solidity source file.");
            return 1;
        }

        try {
            if (!solcInput.settings) solcInput.settings = {};
            if (!solcInput.settings.outputSelection) solcInput.settings.outputSelection = {};
            if (!solcInput.settings.outputSelection['*']) solcInput.settings.outputSelection['*'] = {};
            if (!solcInput.settings.outputSelection['*']['*']) solcInput.settings.outputSelection['*']['*'] = [];

            solcInput.settings.outputSelection['*']['*'].push('storageLayout')

            const compiler = await this.createCompiler(model.version);
            const {contracts} = await this.compile(compiler, solcInput);

            let result = {};

            for (const contract of Object.keys(contracts)) {
                const artifacts = contracts[contract];

                for (const artifact of Object.keys(artifacts)) {
                    const storage = artifacts[artifact]?.storageLayout?.storage;
                    if (!storage || !storage.length)
                        continue;

                    result[artifact] = storage.map(x => ({ slot: x.slot, offset: x.offset, name: x.label, type: x.type }));
                }
            }

            if (!!model.outputFile) {
                fs.writeFileSync(model.outputFile, JSON.stringify(result, null, 2));
                this.output.log("Structured output written to:", model.outputFile);
            }

            if (this.input.quiet) {
                if (!model.outputFile) {
                    process.stdout.write(JSON.stringify(result), "utf-8");
                }
            }
            else {

                const console = this.output;

                for(const contract in result) {
                    console.log('\n' + chalk.bold('Storage layout for contract'), chalk.magenta(contract));
                    console.log('\n  ---------+----------+--------------------------------+----------------------------------------------------------------')
                    console.log(  '  Slot     | Offset   | Name                           | Type ')
                    console.log(  '  ---------+----------+--------------------------------+----------------------------------------------------------------')

                    for (const variable of result[contract]) {
                        const slot = `${variable.slot}`.padEnd(8);
                        const offset = variable.offset.toString().padEnd(8);
                        const name = variable.name.padEnd(30);
                        const type = variable.type;
                        console.log(`  ${chalk.yellow(slot)} | ${chalk.yellow(offset)} | ${chalk.bold(name)} | ${chalk.dim(type)}`)
                    }
                }

                console.log('');
            }

            return 0;
        }
        catch (e) {
            this.output.error(e);
            return 1;
        }
    }

    private async usage() {
        const console = this.output;

        console.log("Usage: web3 layout [options] <sol-input-json | sol-source-code>");
        console.log("Available options:");

        commonHelp(console);
        solCompilerHelp(console);

        console.log("");
        await solCompilerVersions(console);
        console.log("");
    }
}
