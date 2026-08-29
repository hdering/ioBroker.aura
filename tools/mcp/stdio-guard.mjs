// Keeps stdout clean for the JSON-RPC stream.
//
// A stdio MCP server speaks protocol on stdout. Any dependency that does a plain
// console.log — @iobroker/ws does under DEBUG, and a future one might do so
// unconditionally — writes a line straight into the middle of a JSON-RPC frame
// and the client drops the connection with a parse error that names nothing.
//
// Imported first in server.mjs, before anything that could log.

const stderrWrite = process.stderr.write.bind(process.stderr);

for (const level of ['log', 'info', 'debug', 'dir', 'trace']) {
    console[level] = (...args) => {
        stderrWrite(`${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`);
    };
}

export {};
