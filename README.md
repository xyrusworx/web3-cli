# XyrusWorx Web3 Utility CLI

This CLI tool offers options to interact with EVM-based blockchains.

## Installing

Use the following command with Node 16+ installed:

```bash
    npm install -g @xyrusworx/web3-cli
```

## Usage

The program is called using `web3`. Each call is structured the following way:

```
web3 [global options] <command name> [command options]
```

There are two kinds of options: those for the CLI itself (global options), and those for a specific command.
The key difference is that those for the CLI come directly after the `web3` program, the ones for the command
follow the command name. The global options are generally available for all commands and control overall program
behavior. 

### Supported commands

| Command    | Description                                                                                                                                                                                                                                                      |
|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `call`     | Executes `eth_call` using given call data to a given contract address.                                                                                                                                                                                           |
| `simulate` | Sends a simulated transaction to a given contract address. The transaction is executed on an ephemeral fork of the chain, so no real transaction is sent. This also enables sending transactions as any address.                                                 |
| `replay`   | Similar to `simulate`, except that the parameters of the transaction including the block are derived from a given transaction hash, allowing to replay a past (real) transaction and obtain diagnostic information.                                              |
| `encode`   | Encodes a list of parameters using a given function signature, to obtain valid calldata, usable in `call` and `simulate`. The output of this command can be piped to the aforementioned commands, if the `-q ` option was passed.                                |
| `decode`   | Decodes arbitrary hex data using a comma-separated list of Solidity data types (such as `uint256`, `address`, ...). If `call` was invoked with the `-q` option, its output can be piped to this command, which needs to receive the `-i` option.                 |
| `dump`     | Fetches the contents of the contract storage at a given address (and optionally a slot index) and writes it to the console and/or a binary output file. If no slot index is given, the contract storage is scanned until a completely empty slot is encountered. |

### Global options

| Option      | Shortcut(s) | Description                                                                                                               |
|-------------|-------------|---------------------------------------------------------------------------------------------------------------------------|
| `--help`    | `-h`, `-?`  | Shows the help screen                                                                                                     |
| `--nologo`  | None        | Suppresses the output of the program name and version. <br/>This is automatically applied with the `-q` / `--quiet` flag. |
| `--quiet`   | `-q`        | Suppresses all output except essential data. <br/>This is useful for piping.                                                   |
| `--verbose` | `-v`        | Adds more diagnostic output to the execution. <br/>This is mutually exclusive with `--quiet`.                                  |

### Command options

To see the respective command options, run `web3 <command> -h`.

## Examples

### Example 1: Encode the call data for a token transfer

```bash
# WETH
TOKEN=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
ADDRESS=0x752031bb91c61bfc0b280e36434e67e0d43fadbc

# Send 1 token (1,000,000,000,000,000,000 with 18 decimals)
web3 encode "transfer(address,uint256)" $ADDRESS 1000000000000000000
```

The resulting calldata (`0x...`) can be attached to a transaction using a wallet.

### Example 2: Simulate a token transfer at a given block

For the values of `ADDRESS` and `TOKEN`, see the above example.

```bash
# Special environment variable, which is picked up by the web3 command
export WEB3_ACCOUNT=0x55b11bb935685f3ea5ea6385410bd1f5aef57ce6

web3 -q encode "transfer(address,uint256)" $ADDRESS 1000000000000000000 | \
web3 simulate -b 16320406 -i $TOKEN 
```

Using the `-q` flag, you can instruct `web3` to only output data relevant for further processing.
Please note that it must be placed between `web3` and the respective command (`encode`), unlike the
`-i` flag, which is owned by the command, hence must be placed after it. The latter flag instructs
`simulate` to use `STDIN` instead of an argument for the calldata.

Using the `-b` flag, you can instruct `simulate` to use a specific block, instead of the latest.

### Example 3: Get the balance of a token holder

For the values of `ADDRESS` and `TOKEN`, see the above example.

```bash
web3 -q encode "balanceOf(address)" $ADDRESS | \
web3 -q call -i $TOKEN | \
web3 decode -i uint256 
```

You can pipe the output of `call` to `decode` to extract readable / processable results instead of a
raw hex string. The last parameter is a comma-separated list of data types, which are passed to the 
decoder. This is arbitrary, meaning you can decode any hex data interpreting them as any Solidity type.

## How to build

Just run:

```bash
    npm install
    npm run pack
```

This will create a `dist/` folder with the deployable package. It can be released with `cd dist/ && npm publish`
