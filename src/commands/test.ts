// noinspection JSUnusedGlobalSymbols

import {Command, CommandOutput} from "../cmd";

export default class TestCommand implements Command {

    constructor(private _out: CommandOutput) {
    }

    async run(args: string[]): Promise<number> {
        this._out.debug("Test command running with args:", args);
        return 0;
    }

}
