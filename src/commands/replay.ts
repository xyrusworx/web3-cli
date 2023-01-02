import {CommandInput, CommandOutput} from "../cmd";
import {
    evmNetworkHelp,
    evmSimulatorHelp,
    EvmSimulatorParameters,
    parseSimulatorArguments,
    SimulatorCommand
} from "../shared/simulator";
import {commonHelp, parseArguments} from "../shared/common";

// noinspection JSUnusedGlobalSymbols
export default class ReplayCommand extends SimulatorCommand {
    constructor(inp: CommandInput, out: CommandOutput) {super(inp, out)}

    public async run(args: string[]): Promise<number> {
        const console = this.output;
        const { exit, model } = parseArguments<EvmSimulatorParameters>(console, args, parseSimulatorArguments);

        if (!!model?.showHelp) {
            this.usage();
            return exit || 0;
        }
        if (exit !== undefined)
            return exit || 0;

        const txHash = args[args.length - 1];
        if (!txHash || !txHash.match(/^(0[xX])?[a-fA-F0-9]+$/)) {
            console.error("Invalid transaction hash:", txHash);
            return 1;
        }

        const simulator = this.createSimulator();
        const txResult = await simulator.replayTransaction(model.rpcUrl, txHash);

        return this.processResult(this.input, model, txResult);
    }

    private usage() {
        const console = this.output;

        console.log("Usage: web3 replay [options] <transaction hash>");
        console.log("Available options:");

        commonHelp(console);
        evmSimulatorHelp(console);

        console.log("");
        evmNetworkHelp(console);
        console.log("");
    }
}
