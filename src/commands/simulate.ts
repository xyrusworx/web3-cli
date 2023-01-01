import {CommandOutput} from "../cmd";
import {
    evmNetworkHelp,
    evmSimulatorHelp,
    EvmSimulatorParameters,
    parseSimulatorArguments,
    SimulatorCommand
} from "../shared/simulator";
import {commonHelp, parseArguments} from "../shared/common";
import {BigNumber} from "ethers";

// noinspection JSUnusedGlobalSymbols
export default class SimulateCommand extends SimulatorCommand {
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

        let from: string, value: string, block: number;
        let fromStdin: boolean = false;

        for(let i = 0; i < args.length; i++) {
            const arg = args[i];
            switch (arg) {
                case "-i":
                case "--stdin":
                    fromStdin = true;
                    break;

                case "-u":
                case "--from":
                    from = args[++i];
                    if (!from.match(/^(0[xX])?[a-fA-F0-9]{40}$/)) {
                        console.error("Invalid sender address:", from);
                        return 1;
                    }
                    break;

                case "-v":
                case "--value":
                    value = args[++i];
                    if (!value.match(/^(0[xX][a-fA-F0-9]{40})|(\d+)$/)) {
                        console.error("Invalid transaction value:", value);
                        return 1;
                    }
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

        if (!from) {
            from = "0x0000000000000000000000000000000000000000";
        }

        const simulator = this.createSimulator();
        const txResult = await simulator.simulateTransaction({
            from, to, data, block,
            rpcUrl: model.rpcUrl,
            value: value !== undefined ? BigNumber.from(value).toNumber() : undefined
        });

        return this.processResult(model, txResult);
    }

    private usage() {
        const console = this.output;

        console.log("Usage: web3 simulate [options] <target address> [<data>]");
        console.log("Available options:");

        commonHelp(console);
        evmSimulatorHelp(console);

        console.log("  --block / -b <number>  Sets the block height for the simulation to the given number.");
        console.log("                         If unspecified, the latest block is used.")
        console.log("  --value / -v <number>  Uses the given value as the transaction value.");
        console.log("                         Must be in native currency. Hex values are supported.")
        console.log("  --from / -u <address>  Sets the sender address for the transaction.");
        console.log("  --stdin / -i           If set, the ABI-encoded data is read from STDIN.");
        console.log("                         This is useful in combination with the \"encode\" command.")
        console.log("");
        console.log("The data must be ABI-encoded data in hex representation. Unless --stdin / -i is set, it");
        console.log("is mandatory to specify the ABI-encoded data. If you want to send empty data, specify \"0x\".")

        console.log("");
        evmNetworkHelp(console);
        console.log("");
    }
}
