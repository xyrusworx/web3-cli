import {CommandInput, CommandOutput} from "../cmd";
import {
    evmNetworkHelp,
    evmSimulatorHelp,
    EvmSimulatorParameters,
    parseSimulatorArguments,
    SimulatorCommand
} from "../shared/simulator";
import {commonHelp, parseArguments} from "../shared/common";
import fs from "fs";

// noinspection JSUnusedGlobalSymbols
export default class DumpCommand extends SimulatorCommand {
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

        let block: number, slot: number = -1, start = 0, count: number = -1;

        for(let i = 0; i < args.length; i++) {
            const arg = args[i];
            switch (arg) {
                case "--slot":
                    slot = +(args[++i]);
                    if (Number.isNaN(slot) || slot < 0) {
                        console.error("Invalid slot:", args[i]);
                        return 1;
                    }
                    break;

                case "--start":
                    start = +(args[++i]);
                    if (Number.isNaN(start) || start < 0) {
                        console.error("Invalid start index:", args[i]);
                        return 1;
                    }
                    break;

                case "--count":
                    count = +(args[++i]);
                    if (Number.isNaN(count) || count <= 0) {
                        console.error("Invalid count:", args[i]);
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
        const address = args[args.length - 1];
        if (!address || !address.match(/^(0[xX])?[a-fA-F0-9]{40}$/)) {
            console.error("Invalid contract address:", address);
            return 1;
        }

        const simulator = this.createSimulator();
        const data: number[] = [];
        let hex: string[] = [];
        let raw: string[] = [];

        await simulator.do({block: block, rpcUrl: model.rpcUrl }, async provider => {

            const getSlot = async index => {
                if (this.input.verbose) process.stdout.write("Reading slot " + (index) + "...");
                const result = await provider.getStorageAt(address, index);
                if (this.input.verbose)  process.stdout.write(result + "\n");
                return result;
            }

            const dumpSlotData = (currentSlot, index) => {
                if (currentSlot == "0x") currentSlot = "0x0000000000000000000000000000000000000000000000000000000000000000"
                const slotBuffer = new Uint8Array(32);
                currentSlot = currentSlot.replace(/^0[xX]/, '');
                for (let i = 0; i < 64; i += 2) {
                    const h = "0x" + currentSlot.substring(i, i+2);
                    const b = Number.parseInt(h, 16);
                    data.push(b); slotBuffer[i / 2] = b;
                }

                const r = new TextDecoder().decode(slotBuffer);

                hex.push(((index * 32).toString(16).padStart(8, '0')) + " | " + currentSlot.substring(0,32).replace(/([a-fA-F0-9]{2})/g, '$1 ').toUpperCase());
                hex.push(((index * 32 + 16).toString(16).padStart(8, '0')) + " | " + currentSlot.substring(32).replace(/([a-fA-F0-9]{2})/g, '$1 ').toUpperCase());

                raw.push(r.substring(0, 16).replace(/[\x00-\x19]/g, '.'));
                raw.push(r.substring(16).replace(/[\x00-\x19]/g, '.'));
            }

            if (slot < 0) {
                if (count > 0) for (let index = start; index < count + start; index++) {
                    const currentSlot = await getSlot(index);
                    dumpSlotData(currentSlot, index)
                }
                else {
                    let index = start;
                    let currentSlot = await getSlot(index++);
                    while ("0x" !== currentSlot) {
                        dumpSlotData(currentSlot, index - 1)
                        currentSlot = await getSlot(index++);
                    }
                }
            }
            else {
                dumpSlotData(await provider.getStorageAt(address, slot), 0)
            }
        });

        const buffer = new Uint8Array(data.length);
        data.forEach((x,i) => buffer[i] = x);

        if (!!model.outputFile) {
            fs.writeFileSync(model.outputFile, buffer);
            console.log("Structured output written to:", model.outputFile);
        }

        if (this.input.quiet) {
            process.stdout.write(buffer, "utf-8");
        }
        else {

            console.log("           00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F")
            console.log("         + ----------------------------------------------- +")

            for (let i = 0; i < hex.length; i++) {
                console.log(hex[i] + "| " + raw[i]);
            }
        }

        return 0;
    }

    private usage() {
        const console = this.output;

        console.log("Usage: web3 dump [options] <contract-address>");
        console.log("Available options:");

        commonHelp(console);
        evmSimulatorHelp(console);

        console.log("  --block / -b <number>  Sets the block height for the simulation to the given number.");
        console.log("                         If unspecified, the latest block is used.")
        console.log("  --slot <number>        If set, data is dumped for only a specific storage slot.");
        console.log("  --start <number>       If no specific slot is selected, this parameter sets the starting");
        console.log("                         point of the storage scan. If unspecified, slot 0 is assumed.")
        console.log("  --count <number>       Sets the amount of slots to scan, if no specific storage slot is");
        console.log("                         selected. If unspecified, the scan is ended with the first slot")
        console.log("                         which has no data.")

        console.log("");
        evmNetworkHelp(console);
        console.log("");
    }
}
