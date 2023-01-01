import {CommandOutput} from "../cmd";

export interface CommonParameters {
    readonly showHelp: boolean;
}

export interface ParseResult<T> {
    exit?: number;
    model?: T;
}

function commonParse(output: CommandOutput, args: string[]): ParseResult<CommonParameters> {
    for(let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case "-?":
            case "-h":
            case "--help":
                return {
                    exit: 0,
                    model: { showHelp: true }
                };
        }
    }

    return {
        exit: undefined,
        model: {
            showHelp: false
        }
    }
}

export function parseArguments<T>(output: CommandOutput, args: string[], ...parser: ((output: CommandOutput, args: string[]) => ParseResult<any>)[]): ParseResult<CommonParameters & T> {
    let model: any = {};

    for (const parse of [commonParse, ...parser]) {
        const result = parse(output, args);
        model = Object.assign(model, result.model || {});

        if (result.exit !== undefined) {
            return { exit: result.exit, model }
        }
    }

    return { model };
}

export function commonHelp(output: CommandOutput) {
    output.log("  --help / -h / -?       Shows this help screen");
}
