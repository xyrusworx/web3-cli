import {CommandInput, CommandOutput} from "../cmd";
import {
    evmNetworkHelp,
    evmSimulatorHelp,
    EvmSimulatorParameters,
    parseSimulatorArguments,
    SimulatorCommand
} from "../shared/simulator";
import {commonHelp, parseArguments} from "../shared/common";
import {BigNumber, ethers} from "ethers";
import fs from "fs";
import {
    compareStates,
    ContractStorage,
    ContractStorageState,
    decodeRawStorageData,
    StorageVariable
} from "../shared/cstorage";
import {DoOptions, Simulator} from "@xyrusworx/evm-simulator";

// noinspection JSUnusedGlobalSymbols
export default class SimulateCommand extends SimulatorCommand {
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

        let from: string = process.env.WEB3_ACCOUNT,
            value: string,
            block: number,
            fromStdin: boolean = false,
            layoutFile: string;

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

                case "-cl":
                case "--layout":
                    layoutFile = args[++i];
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

        // noinspection DuplicatedCode
        const to = args[args.length - (fromStdin ? 1 : 2)];
        if (!to || !to.match(/^(0[xX])?[a-fA-F0-9]{40}$/)) {
            console.error("Invalid target address:", to);
            return 1;
        }

        let layout;
        try {
            layout = JSON.parse(fs.readFileSync(layoutFile).toString());

            if (!Array.isArray(layout) || layout.find(x => x.slot === undefined || x.offset === undefined || x.name === undefined || x.type === undefined)) {
                // noinspection ExceptionCaughtLocallyJS
                throw "Not a layout JSON";
            }
        } catch (e) {
            this.output.error(
                "The supplied layout file is not valid. You can create a layout file from standard Solidity " +
                "input JSON or Solidity source code using the 'layout' command. Please make sure you supply the " +
                "layout for a single contract (should be a JSON array, not a map).");
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
        const options = {
            from, to, data, block,
            rpcUrl: model.rpcUrl,
            value: value !== undefined ? value.startsWith("0x") ? BigNumber.from(value).toNumber() : +value : undefined
        };

        let beforeState, afterState;
        if (!!layout) {
            beforeState = await this.readState(layout, to, simulator, options);
        }

        const txResult = await simulator.simulateTransaction(options, async provider => {
            if (!!layout) {
                afterState = await this.readState(layout, to, provider, options);
            }
        });

        if (!!beforeState && !!afterState) {

            console.log("");
            console.log("The following changes were detected:");
            await compareStates(console, beforeState, afterState);
        }

        return this.processResult(this.input, model, txResult);
    }

    private async readState(layout: StorageVariable[], address: string, simulator: Simulator | ethers.providers.Web3Provider, options: DoOptions): Promise<ContractStorageState> {

        const console = this.output;
        const storage = new ContractStorage(null, address);
        const getSlot = async (ix, provider) => {
            storage.output = console;
            storage.setProvider(provider);
            return await storage.getStorageAt(ix)
        }

        try {
            const values: ContractStorageState = {};
            const callback = async provider => {
                for (const variable of layout) {
                    values[variable.name] = {
                        variable: variable,
                        value: await decodeRawStorageData(variable, i => getSlot(i, provider))
                    };
                }
            };
            if (!!(<any>simulator).do) {
                await (<Simulator>simulator).do(options, callback)
            }
           else {
               await callback(<ethers.providers.Web3Provider>simulator);
            }

            return values;
        }
        catch (e) {
            console.error(e);
            throw e;
        }
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
        console.log("                         You can also set this using the environment variable WEB3_ACCOUNT.")
        console.log("  --stdin / -i           If set, the ABI-encoded data is read from STDIN.");
        console.log("                         This is useful in combination with the \"encode\" command.")
        console.log("  --layout / -cl <file>  Provides a JSON file with the contract storage layout information,");
        console.log("                         which enables change detection in the contract. The JSON file can");
        console.log("                         be created with the \"layout\" command.");
        console.log("");
        console.log("The data must be ABI-encoded data in hex representation. Unless --stdin / -i is set, it");
        console.log("is mandatory to specify the ABI-encoded data. If you want to send empty data, specify \"0x\".")

        console.log("");
        evmNetworkHelp(console);
        console.log("");
    }
}
