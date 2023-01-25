import {CommandInput, CommandOutput} from "../cmd";
import {commonHelp, parseArguments} from "../shared/common";
import {readAllStdin} from "../console";
import {
    evmNetworkHelp,
    evmSimulatorHelp,
    EvmSimulatorParameters,
    parseSimulatorArguments,
    SimulatorCommand
} from "../shared/simulator";
import {ContractStorage, decodeRawStorageData, RawSlotData, StorageVariable} from "../shared/cstorage";
import chalk from "chalk";
import fs from "fs";
import Web3 from "web3";
import {BigNumber} from "ethers";

// noinspection JSUnusedGlobalSymbols
export default class ReadCommand extends SimulatorCommand {
    constructor(inp: CommandInput, out: CommandOutput) {super(inp, out)}

    public async run(args: string[]): Promise<number> {

        const console = this.output;
        const { exit, model } = parseArguments<EvmSimulatorParameters>(console, args, parseSimulatorArguments);

        if (!!model?.showHelp) {
            await this.usage();
            return exit || 0;
        }
        if (exit !== undefined)
            return exit || 0;

        let fromStdin: boolean = false, block: number, dumpFileName: string, offline: boolean = false;
        let outputFile: string;

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            switch (arg) {

                case "-d":
                case "--dump":
                    dumpFileName = args[++i];
                    break;

                case "-b":
                case "--block":
                    block = +(args[++i]);
                    if (Number.isNaN(block) || block <= 0) {
                        console.error("Invalid block height:", args[i]);
                        return 1;
                    }
                    break;

                case "-i":
                case "--stdin":
                    fromStdin = true;
                    break;

                case "--offline":
                    offline = true;
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

        const address = fromStdin
            ? args[args.length - 1]
            : args[args.length - 2];

        if (!address || !address.match(/^(0[xX])?[a-fA-F0-9]{40}$/)) {
            console.error("Invalid contract address:", address);
            return 1;
        }

        let dumpFile: number[];
        if (dumpFileName) {
            dumpFile = [...fs.readFileSync(dumpFileName)];
        }

        let layout;
        try {
            layout = JSON.parse(data);

            if (!Array.isArray(layout) || layout.find(x => x.slot === undefined || x.offset === undefined || x.name === undefined || x.type === undefined)) {
                this.output.error(
                    "The supplied input is not a valid layout file. You can create a layout file from standard Solidity " +
                    "input JSON or Solidity source code using the 'layout' command. Please make sure you supply the " +
                    "layout for a single contract (should be a JSON array, not a map).");
                return 1;
            }
        } catch (e) {
            this.output.error("Failed to process input. Please supply wither valid standard Solidity input JSON or a Solidity source file.");
            return 1;
        }

        try {
            let outputObject;

            if (!!dumpFile) {
                const callback = async provider => {
                    const storage = new ContractStorage(provider, address);
                    storage.output = this.output;
                    const getSlot = async ix => {

                        const cacheResult = storage.getStorageCacheAt(ix);
                        if (!!cacheResult) {
                            return cacheResult;
                        }

                        const slotBN = BigNumber.from(ix);
                        const dumpLength = dumpFile.length;
                        const requestedOffset = slotBN.mul(32);
                        const requestedOffsetEnd = requestedOffset.add(32);

                        let result;
                        if (requestedOffset.gte(dumpLength)) {
                            if (!provider) {
                                result = "0x";
                                console.debug("Slot", slotBN.toString(), "is out of bounds. Returning empty chunk.");
                            }
                            else {
                                result = await storage.getStorageAt(ix);
                            }
                        }
                        else {
                            const slice = dumpFile.slice(requestedOffset.toNumber(), requestedOffsetEnd.toNumber());
                            result = Web3.utils.bytesToHex(slice);
                            if (requestedOffsetEnd.gte(dumpLength))
                                console.debug("Slot", slotBN.toString(), "is partially out of bounds. Returning", BigNumber.from(dumpLength).sub(requestedOffset).toString(), "bytes:", result);
                            else
                                console.debug("Slot", slotBN.toString(), "was fetched from dump file:", result);
                        }

                        storage.setStorageCacheAt(ix, result);
                        return result;
                    }

                    outputObject = await this.read(layout, getSlot);
                }

                if (offline) {
                    console.debug('Processing dump file:', dumpFileName);
                    await callback(undefined);
                }
                else {
                    console.debug('Processing dump file:', dumpFileName, "- fetching missing slots is allowed.");
                    await this.createSimulator().do({ block, rpcUrl: model.rpcUrl }, provider => callback(provider));
                }
            }
            else {
                console.debug('Processing live blockchain data');
                await this.createSimulator().do({ block, rpcUrl: model.rpcUrl }, async provider => {
                    const storage = new ContractStorage(provider, address);
                    storage.output = this.output;
                    const getSlot = async ix => await storage.getStorageAt(ix)
                    outputObject = await this.read(layout, getSlot);
                });
            }

            if (!!outputFile) {
                fs.writeFileSync(outputFile, JSON.stringify(outputObject, null, "  "));
                this.output.log("Structured output written to:", outputFile);
            }
        }
        catch (e) {
            console.error(e);
            return 1;
        }

        return 0;
    }

    private async read(layout: StorageVariable[], getSlot: ((slot: string | number) => Promise<RawSlotData>)) {

        const console = this.output;

        try {
            if (this.input.verbose) console.log("");
            const values: {[key: string]: string} = {};
            const realValues: {[key: string]: any} = {};

            for (const variable of layout) {
                const value = await decodeRawStorageData(variable, getSlot);
                if (Array.isArray(value)) {
                    if (value.length > 1)
                        values[variable.name] = "[ " + value[0] + " and " + (value.length - 1) + " more ]";
                    else if (value.length > 0)
                        values[variable.name] = "[ " + value[0] + " ]";
                    else values[variable.name] = "<empty array>";
                }
                else if ((<any>value)._isMapping) {
                    values[variable.name] = `<mapping>`;
                    continue; // do not add to realValues
                }
                else values[variable.name] = `${value}`;

                realValues[variable.name] = value;
            }

            const maxNameLength = Object.keys(values).concat("Storage variable").sort((a,b) => b.length - a.length)[0]?.length;
            const maxValueLength = Object.values(values).concat("Value").sort((a,b) => b.length - a.length)[0]?.length;

            if (!maxNameLength || !maxValueLength) {
                return realValues;
            }

            let hdrName = "--", hdrValue = "--";
            for (let i = 0; i < maxNameLength; i++) hdrName += "-";
            for (let i = 0; i < maxValueLength; i++) hdrValue += "-";

            console.log('\n+' + hdrName + "+" + hdrValue + "+");
            console.log('| ' + chalk.bold("Storage variable".padEnd(maxNameLength)) + " | " + chalk.bold("Value".padEnd(maxValueLength)) + " |");
            console.log('+' + hdrName + "+" + hdrValue + "+");

            for (const key in values) {
                console.log('| ' + chalk.bold(key.padEnd(maxNameLength)) + " | " + (values[key]||'').padEnd(maxValueLength) + " |");
            }

            console.log('+' + hdrName + "+" + hdrValue + "+");
            console.log("")

            return realValues;
        }
        catch (e) {
            console.error(e);
            throw e;
        }
    }

    private async usage() {
        const console = this.output;

        console.log("Usage: web3 read [options] <contract-address> <layout-json>");
        console.log("Available options:");

        commonHelp(console);
        evmSimulatorHelp(console);

        console.log("  --output / -o <file>   Writes a structured JSON output to the specified file.");
        console.log("  --dump / -d <path>     Uses a pre-fetched storage dump file (from the \"dump\" command)");
        console.log("                         instead of querying the storage data from the blockchain. By")
        console.log("                         setting this option, all connection options like --rpc-url / -r, ")
        console.log("                         --block / -b or --network / -n are ignored, if also the --offline")
        console.log("                         option has been set. Otherwise the data is fetched from the using")
        console.log("                         the provided connection options.")
        console.log("  --block / -b <number>  Sets the block height for the storage queries to the given number.");
        console.log("                         If unspecified, the latest block is used. ")
        console.log("  --stdin / -i           If set, the layout JSON is read from STDIN.");
        console.log("                         This is useful in combination with the \"layout\" command.");
        console.log("  --offline              Disables querying missing slots when using the --dump / -d option.");

        console.log("");
        evmNetworkHelp(console);
        console.log("");
    }
}
