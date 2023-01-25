import Web3 from "web3";
import {BigNumber, BytesLike, ethers} from "ethers";
import {keccak256} from "ethers/lib/utils";
import chalk from "chalk";
import {CommandOutput} from "../cmd";

export interface StorageVariable {
    slot: string | number,
    offset: number,
    name?: string,
    type: StorageVariableType
}

export interface MappingStorageVariable extends StorageVariable {
    type: MappingType
}

export type StorageVariableType = InplaceEncodedType | DynamicArrayType | MappingType;

export interface InplaceEncodedType {
    encoding: "inplace",
    label: string,
    numberOfBytes: string | number,
    members?: StorageVariable[]
}

export interface DynamicArrayType {
    encoding: "dynamic_array",
    label: string,
    numberOfBytes: string | number,
    base: StorageVariableType
}

export interface MappingType {
    encoding: "mapping",
    label: string,
    numberOfBytes: string | number,
    key: StorageVariableType,
    value: StorageVariableType
}

export type RawSlotData = string;

export type ContractStorageState = {[key: string]: { variable: StorageVariable, value: any }};

const defaultAbi = new Web3().eth.abi;

function _typeId(t: StorageVariableType) {
    if (t.label == "address payable") return "address";
    else return t.label;
}
function _decode(type: string, bytes: string, offset?: number, numberOfBytes?: number) {
    const end = 32 - (offset||0);
    const start = end - (numberOfBytes||32);
    const slicedSlotData = "0x" + Web3.utils.bytesToHex(Web3.utils.hexToBytes(bytes).slice(start, end)).replace(/^0[xX]/, '').padStart(64, '0');
    return defaultAbi.decodeParameter(type, slicedSlotData);
}

export async function decodeRawStorageData(variable: StorageVariable, fetchSlotCallback: ((slot: string | number) => Promise<RawSlotData>)): Promise<any> {
    const slotData = await fetchSlotCallback(variable.slot);

    if (variable.type.encoding == "inplace") {
        return _decode(_typeId(variable.type), slotData, +variable.offset, +variable.type.numberOfBytes);
    }
    else if (variable.type.encoding == "dynamic_array") {
        const arrayType = <DynamicArrayType>variable.type;
        const arraySize = +_decode("uint256", slotData, variable.offset, +variable.type.numberOfBytes);
        const startingPosition = BigNumber.from(keccak256(ethers.utils.zeroPad([+variable.slot], 32)));

        const array = [] ;for (let i = 0; i < arraySize; i++) {
            const elementSize = +arrayType.base.numberOfBytes;
            const elementsPerSlot = Math.floor(32 / elementSize);
            const slot = startingPosition.add(Math.floor(i / elementsPerSlot)).toHexString();
            const itemVariable = { slot, type: arrayType.base, offset: (i % elementsPerSlot) * elementSize};
            array.push(await decodeRawStorageData(itemVariable, fetchSlotCallback));
        }

        return array;
    }
    else if (variable.type.encoding == "mapping") {
        return new Mapping() // mappings can be decoded with decodeRawMappingStorageData
    }
    else throw "Unsupported variable type: " + (<any>variable.type)?.encoding;
}

export async function decodeRawMappingStorageData(variable: MappingStorageVariable, key: BytesLike, fetchSlotCallback: ((slot: string | number) => Promise<RawSlotData>)): Promise<any> {
    const mappingBasis = ethers.utils.zeroPad([+variable.slot], 32);
    const mappingKey = ethers.utils.zeroPad(key, 32);

    const storagePosition = BigNumber.from(keccak256([...mappingKey, ...mappingBasis]));
    const itemVariable = { slot: storagePosition.toHexString(), type: variable.type.value, offset: 0 };

    return await decodeRawStorageData(itemVariable, fetchSlotCallback);
}

export async function compareStates(output: CommandOutput, beforeState: ContractStorageState, afterState: ContractStorageState): Promise<void> {

    for (const key in beforeState) {
        const before = beforeState[key];
        const after = afterState[key];

        if (!after) {
            output.log(" ", chalk.red("[deleted]"), key);
            continue;
        }

        if (Array.isArray(before.value)) {
            const childBefore = {};
            const childAfter = {};

            const beforeVariable: StorageVariable = {
                type: (<DynamicArrayType>before.variable.type).base,
                offset: before.variable.offset,
                slot: before.variable.slot,
            };

            const afterVariable: StorageVariable = {
                type: (<DynamicArrayType>after.variable.type).base,
                offset: after.variable.offset,
                slot: after.variable.slot,
            };

            for (let i = 0; i < before.value.length; i++) childBefore[i] = { variable: { ...beforeVariable, name: before.variable.name + "[" + i + "]"}, value: before.value[i]};
            for (let i = 0; i < after.value.length; i++) childAfter[i] = { variable: { ...afterVariable, name: after.variable.name + "[" + i + "]"}, value: after.value[i]};

            await compareStates(output, childBefore, childAfter);
        }
        else if (!before.value._isMapping) {
            if (before.value != after.value) {
                output.log(" ", chalk.yellow("[changed]"), key + ":", before.value, "==>", after.value)
            }
        }
    }

    for (const key in afterState) {
        const before = beforeState[key];
        const after = afterState[key];

        if (!!before) {
            continue;
        }

        if (Array.isArray(after.value)) {
            for (let i = 0; i < after.value.length; i++) {
                output.log(" ", chalk.yellow("[added]"), after.variable.name + "[" + i + "]:", after.value)
            }
        }
        else if (!after.value._isMapping) {
            if (before.value != after.value) {
                output.log(" ", chalk.yellow("[added]"), key + ":", after.value)
            }
        }
    }
}

export class ContractStorage {

    private readonly slotMap = new Map<string, string>();

    constructor(private provider: ethers.providers.Web3Provider, private address: string) {
        if (!ethers.utils.isAddress(address)) {
            throw "Invalid address: " + address;
        }
    }

    public output: CommandOutput = console;

    public getStorageCacheAt(slot: number | string): string | undefined {
        const slotBN: BigNumber = BigNumber.from(slot);
        const slotCacheKey = slotBN.toString();

        if (this.slotMap.has(slotCacheKey)) {
            const cacheResult = this.slotMap.get(slotCacheKey);
            this.output.debug("Slot", slotBN.toHexString(), "has been read from in-memory cache:", cacheResult);
            return cacheResult;
        }

        return undefined;
    }

    public setProvider(provider: ethers.providers.Web3Provider) {
        this.provider = provider;
    }

    public setStorageCacheAt(slot: number | string, value: string): void {
        const slotBN: BigNumber = BigNumber.from(slot);
        const slotCacheKey = slotBN.toString();

        this.slotMap.set(slotCacheKey, value);
    }

    public async getStorageAt(slot: number | string): Promise<string> {
        const slotBN: BigNumber = BigNumber.from(slot);
        const slotCacheKey = slotBN.toString();

        if (this.slotMap.has(slotCacheKey)) {
            const cacheResult = this.slotMap.get(slotCacheKey);
            this.output.debug("Slot", slotBN.toHexString(), "has been read from in-memory cache:", cacheResult);
            return cacheResult;
        }

        const result = await this.provider.getStorageAt(this.address, slotBN.toHexString());
        this.slotMap.set(slotCacheKey, result);

        this.output.debug("Slot", slotBN.toHexString(), "has been read from provider:", result);
        return result;
    }
}

class Mapping {
    // noinspection JSUnusedLocalSymbols
    private readonly _isMapping = true;
}
