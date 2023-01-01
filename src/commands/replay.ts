import {Command, CommandOutput} from "../cmd";
import evm from "@xyrusworx/evm-simulator";

// noinspection JSUnusedGlobalSymbols
export default class ReplayCommand implements Command {
    constructor(private out: CommandOutput) {}

    public async run(args: string[]): Promise<number> {
        const console = this.out;

        let rpc = process.env.WEB3_RPC || "https://rpc.ankr.com/eth";
        let txHash: string = undefined;

        for(let i = 0; i < args.length; i++) {
            const arg = args[i];
            switch (arg) {
                case "-?":
                case "-h":
                case "--help":
                    rpc = args[++i];
                    break;
                case "-r":
                case "--rpc":
                    rpc = args[++i];
                    break;
                default:
                    if (i == args.length - 1) {
                        txHash = arg;
                        if (!txHash.match(/^(0[xX])?[a-fA-F0-9]+$/)) {
                            console.error("Invalid transaction hash:", txHash);
                            return 1;
                        }
                        continue;
                    }

                    this.usage();
                    return 1;
            }
        }

        if (!rpc) {
            console.error("Invalid JSON-RPC endpoint URL. Please check the -r / --rpc option passed to the command line.")
            return 1;
        }

        if (!txHash) {
            this.usage();
            return 1;
        }

        (<any>evm.simulator).console = this.out;
        await evm.simulator.replayTransaction(rpc, txHash);
        return 0;
    }

    private usage() {
        this.out.log("Usage: web3 replay {command-options}");
        this.out.log("Available options:");
        this.out.log("  --help / -h / -?       Shows this help screen");
        this.out.log("  --rpc / -r             Sets the URL to the JSON-RPC endpoint. Must be an archive node.");
        this.out.log("                         Can also be set using the environment variable WEB3_RPC");
        this.out.log("");
    }
}
