import {CommonParameters, ParseResult} from "./common";
import {Command, CommandInput, CommandOutput} from "../cmd";
import {EthereumNetwork, EthereumNetworkDescription, IEthereumNetworkDescription} from "@xyrusworx/web3";
import chalk from "chalk";
import {CallResult, createSimulator, Simulator, TransactionResult} from "@xyrusworx/evm-simulator";
import fs from "fs";

export interface EvmSimulatorParameters extends CommonParameters {
    readonly rpcUrl?: string;
    readonly outputFile?: string;
}

export function parseSimulatorArguments(output: CommandOutput, args: string[]): ParseResult<EvmSimulatorParameters> {
    const console = output;

    let rpcUrl = process.env.WEB3_RPC || EthereumNetworkDescription[EthereumNetwork.Ethereum].rpc;
    let outputFile: string = undefined;

    for(let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case "-n":
            case "--network":
                const networkName = args[++i]
                const networkDescription = Object.values(EthereumNetworkDescription).find(x => x.id.toLowerCase() == networkName?.toLowerCase());

                if (!networkDescription) {
                    console.error("Unsupported network:", networkName, "- please specify the JSON-RPC URL manually using the -r / --rpc option.");
                    return { exit: 1 };
                }

                rpcUrl = networkDescription.rpc;
                break;

            case "-r":
            case "--rpc":
                rpcUrl = args[++i];
                break;

            case "-o":
            case "--output":
                outputFile = args[++i];
                break;
        }
    }

    if (!rpcUrl) {
        console.error("Invalid JSON-RPC endpoint URL. Please check the -r / --rpc option passed to the command line.")
        return { exit: 1 };
    }

    return {
        model: {
            showHelp: false,
            rpcUrl: rpcUrl,
            outputFile: outputFile
        }
    }
}

export function evmSimulatorHelp(output: CommandOutput) {
    output.log("  --network / -n <name>  Uses the given network. The default network is Ethereum mainnet.");
    output.log("                         A list of supported networks is below. Use --rpc / -r for other networks.")
    output.log("  --rpc / -r <url>       Sets the URL to the JSON-RPC endpoint. Must be an archive node.");
    output.log("                         Can also be set using the environment variable WEB3_RPC");
    output.log("  --output / -o <file>   Writes a structured JSON output to the specified file.");
}

export function evmNetworkHelp(output: CommandOutput) {
    output.log("Supported networks (for --network / -n):")

    const sortNetwork = (a: IEthereumNetworkDescription, b: IEthereumNetworkDescription) => {
        const tna = (a.testnet ? 1 : 0);
        const tnb = (b.testnet ? 1 : 0);
        if (tna != tnb) return tna - tnb;
        return a.chainId - b.chainId;
    }

    for (const network of Object.values(EthereumNetworkDescription).sort(sortNetwork).filter(x => x.id != "ganache" && x.id != "hardhat")) {
        output.log("  ", chalk.magenta(network.id.padEnd(15)), network.name);
    }
}

export abstract class SimulatorCommand implements Command {

    protected constructor(
        protected input: CommandInput,
        protected output: CommandOutput) {}
    abstract run(args: string[]): Promise<number>;

    protected createSimulator(): Simulator {
        const simulator = createSimulator();
        simulator.console = this.output;
        return simulator;
    }

    protected processResult(input: CommandInput, model: EvmSimulatorParameters, result: TransactionResult | CallResult): number {

        if (input.quiet) {
            if (result.status && typeof result.result?.data === "string")
                process.stdout.write(`${result.result.data}\n`, "utf-8");
            return result.status ? 0 : 100;
        }

        const console = this.output;
        if (result.status) {
            const logs = (<any>result).data?.logs || []
            if (logs.length > 0) {
                console.log("Event log:")
            }
            for (const event of logs.sort((a, b) => a.index - b.index)) {
                console.log("  Event", event.index + 1);
                console.log("    Topics: ")
                for (const topic of event.topics) console.log("      " + topic);

                console.log("    Address:", event.address)
                console.log("    Data:   ", event.data);
            }
        }

        if (!!model.outputFile) {
            fs.writeFileSync(model.outputFile, JSON.stringify(result, null, "  "));
            console.log("Structured output written to:", model.outputFile);
        }

        return result.status ? 0 : 100;
    }

}
