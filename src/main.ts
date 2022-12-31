// This is the entry point of the "web3" command line application

import process from "process";
import chalk from "chalk";
import fs from "fs";

import {AppArguments} from "./cargs";
import {WrappedConsoleLog} from "./console";
import {Command, CommandOutput, createCommand} from "./cmd";

function logo(output: CommandOutput) {
    const packageManifest =
        fs.existsSync("./package.json") ? JSON.parse(fs.readFileSync("./package.json").toString()) :
        fs.existsSync("../package.json") ? JSON.parse(fs.readFileSync("../package.json").toString()) :
        undefined;

    const version = packageManifest?.version || "0.0.0";
    output.log(chalk.bold("Web3 Command Line Interface Utility"));
    output.log(chalk.dim("Copyright © XyrusWorx. Provided under GNU GPLv3"));
    output.log(chalk.dim("Version " + version));
    output.log("");
}

async function main(args: string[]) {

    let parsedArgs: AppArguments = undefined;
    let output: CommandOutput = console;

    try {
        parsedArgs = new AppArguments(args || []);
        output = new WrappedConsoleLog(parsedArgs.quiet, parsedArgs.verbose);

        if (!parsedArgs.noLogo && !parsedArgs.quiet) {
            logo(output);
        }
    } catch (e) {
        logo(output);

        output.error("Error:", e?.message || e);
        output.log("");

        AppArguments.printHelp(output);
        process.exit(1);
    }


    let command: Command;

    try {
        command = createCommand(parsedArgs.command, output);
    }
    catch (e) {
        output.error(e?.message || e);
        process.exit(2);
    }

    try {
        const exitCode = await command.run(parsedArgs.commandArgs);
        process.exit(exitCode);
    }
    catch (e) {
        output.error("Failed to execute command", parsedArgs.command, "because of an unhandled error:", e);
        process.exit(3);
    }
}

main(process.argv)
    .then(() => process.exit(0))
    .catch(error => {
        console.error(chalk.red("An unhandled exception occurred during the execution of this application:"), error);
        process.exit(-1);
    });
