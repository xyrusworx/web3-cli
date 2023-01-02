import {Command, CommandInput, CommandOutput} from "../cmd";
import {commonHelp, CommonParameters, parseArguments} from "../shared/common";
import {encodeCallData} from "@xyrusworx/evm-simulator/implementation/helpers";

// noinspection JSUnusedGlobalSymbols
export default class EncodeCommand implements Command {
    constructor(private input: CommandInput, private output: CommandOutput) {}

    public async run(args: string[]): Promise<number> {
        const { exit, model } = parseArguments<CommonParameters>(this.output, args);

        if (!!model?.showHelp) {
            this.usage();
            return exit || 0;
        }
        if (exit !== undefined)
            return exit || 0;

        const firstNonOption = args.findIndex(x => !x.startsWith("-"));
        if (firstNonOption < 0) {
            this.usage();
            return 1;
        }

        const call = args[firstNonOption];
        const callArgs = args.slice(firstNonOption + 1);

        const data = encodeCallData(call, ...callArgs);
        process.stdout.write(data, "utf-8");

        return 0;
    }

    private usage() {
        const console = this.output;

        console.log("Usage: web3 encode [options] <signature> {parameters}");
        console.log("Available options:");

        commonHelp(console);
        console.log("");

        console.log("The signature needs to be passed in ABI format. For example: transfer(address,uint256).")
        console.log("The subsequent arguments are the parameters to the call. Their count must match the signature.")
        console.log("");
    }
}
