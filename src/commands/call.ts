import {CommandOutput} from "../cmd";
import {
    evmNetworkHelp,
    evmSimulatorHelp,
    EvmSimulatorParameters,
    parseSimulatorArguments,
    SimulatorCommand
} from "../shared/simulator";
import {commonHelp, parseArguments} from "../shared/common";

// noinspection JSUnusedGlobalSymbols
export default class QueryCommand extends SimulatorCommand {
    constructor(out: CommandOutput) {super(out)}

    public async run(args: string[]): Promise<number> {
        const console = this.output;
        const { exit, model } = parseArguments<EvmSimulatorParameters>(console, args, parseSimulatorArguments);

        if (!!model?.showHelp) {
            this.usage();
            return exit || 0;
        }
        if (exit !== undefined)
            return exit || 0;

        let block: number,
            fromStdin: boolean = false;

        for(let i = 0; i < args.length; i++) {
            const arg = args[i];
            switch (arg) {
                case "-i":
                case "--stdin":
                    fromStdin = true;
                    break;

                case "-b":
                case "--block":
                    block = +(args[++i]);
                    if (Number.isNaN(block) || block <= 0) {
                        console.error("Invalid block height:", args[i]);
                        return 1;
                    }
                    break;
            }
        }

        // noinspection DuplicatedCode
        const to = args[args.length - (fromStdin ? 1 : 2)];
        if (!to || !to.match(/^(0[xX])?[a-fA-F0-9]{40}$/)) {
            console.error("Invalid target address:", to);
            return 1;
        }

        async function read(stream) {
            return await new Promise<string>(resolve => {
                const chunks = [];
                stream.on("data", chunk => chunks.push(chunk));
                stream.on("end", () => {
                    resolve(Buffer.concat(chunks).toString('utf8').trim());
                });
            });
        }

        let data: string = fromStdin
            ? await read(process.stdin)
            : args[args.length - 1];

        if (!data || !data.match(/^(0[xX])?[a-fA-F0-9]*$/)) {
            console.error("Invalid ABI-encoded data:", data);
            return 1;
        }

        const simulator = this.createSimulator();
        const result = await simulator.call({ to, data, block, rpcUrl: model.rpcUrl });

        return this.processResult(model, result);
    }

    private usage() {
        const console = this.output;

        console.log("Usage: web3 simulate [options] <target address> [<data>]");
        console.log("Available options:");

        commonHelp(console);
        evmSimulatorHelp(console);

        console.log("  --block / -b <number>  Sets the block height for the simulation to the given number.");
        console.log("                         If unspecified, the latest block is used.")
        console.log("  --stdin / -i           If set, the ABI-encoded data is read from STDIN.");
        console.log("                         This is useful in combination with the \"encode\" command.")
        console.log("");
        console.log("The data must be ABI-encoded data in hex representation. Unless --stdin / -i is set, it");
        console.log("is mandatory to specify the ABI-encoded data.")

        console.log("");
        evmNetworkHelp(console);
        console.log("");
    }
}
