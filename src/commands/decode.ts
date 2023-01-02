import {Command, CommandInput, CommandOutput} from "../cmd";
import {commonHelp, CommonParameters, parseArguments} from "../shared/common";
import {BigNumber, ethers} from "ethers";
import {readAllStdin} from "../console";
import fs from "fs";
import chalk from "chalk";

// noinspection JSUnusedGlobalSymbols
export default class DecodeCommand implements Command {
    constructor(private input: CommandInput, private output: CommandOutput) {}

    public async run(args: string[]): Promise<number> {
        const { exit, model } = parseArguments<CommonParameters>(this.output, args);

        if (!!model?.showHelp) {
            this.usage();
            return exit || 0;
        }
        if (exit !== undefined)
            return exit || 0;

        let fromStdin: boolean = false;
        let outputFile: string;

        for(let i = 0; i < args.length; i++) {
            const arg = args[i];
            switch (arg) {
                case "-i":
                case "--stdin":
                    fromStdin = true;
                    break;

                case "-o":
                case "--output":
                    outputFile = args[++i];
                    break;
            }
        }

        let data: string = fromStdin
            ? await readAllStdin(process.stdin)
            : args[args.length - 1];

        if (!data || !data.match(/^(0[xX])?[a-fA-F0-9]*$/)) {
            this.output.error("Invalid ABI-encoded data:", data);
            return 1;
        }

        const signature = args[args.length - 1];
        if (!signature) {
            this.output.error("Missing signature");
            return 1;
        }

        const elements = decodeReturnData(signature, data);

        let i = 0;
        let types = signature.split(",").map(x => x.trim());

        const processElement = (element) => {
            let str: any;
            if (typeof element === "object") {
                if (!!element._isBigNumber) {
                    str = (<BigNumber>element).toString();
                }
                else {
                    str = JSON.stringify(element);
                }
            }
            else {
                str = element;
            }
            return str;
        }

        for (const element of elements) {

            const str = processElement(element);
            if (this.input.quiet) {
                process.stdout.write(`${str}\n`, "utf-8");
            }
            else {
                this.output.log(chalk.magenta(`[${i}] =`.padStart(7)), str, chalk.dim("(" + types[i] + ")"))
            }

            i++;
        }

        if (!!outputFile) {
            fs.writeFileSync(outputFile, JSON.stringify(elements.map((x,i) => ({ index: i, type: types[i], value: processElement(x) })), null, "  "));
            this.output.log("");
            this.output.log("Structured output written to:", outputFile);
        }

        return 0;
    }

    private usage() {
        const console = this.output;

        console.log("Usage: web3 decode [options] <signature>");
        console.log("Available options:");

        commonHelp(console);
        console.log("  --output / -o <file>   Writes a structured JSON output to the specified file.");
        console.log("  --stdin / -i           If set, the ABI-encoded data is read from STDIN.");
        console.log("                         This is useful in combination with the \"call\" command.")
        console.log("");

        console.log("The signature needs to be as comma-separated list of types. For example: address,uint256.")
        console.log("");
    }
}

function decodeReturnData(signature: string, data: string) {
    return new ethers.utils.Interface( [`function _() returns (${signature})`])
        .decodeFunctionResult("_", data)
        .slice();
}
