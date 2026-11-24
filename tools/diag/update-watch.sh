#!/bin/bash
# Runs an ioBroker command (usually the Aura update) and records, second by second,
# how responsive js-controller is and what the machine does meanwhile. Read-only
# apart from the command itself.
#
#   bash update-watch.sh iobroker url iobroker.aura@next
#
# Writes /root/update-watch-<time>/ : ping.log (controller PING latency per second,
# states + objects DB), vmstat.log, top.log (every 10 s), cmd.log (the command's
# output with timestamps), iobroker.log (the ioBroker log of the same minutes).
set -u
[ $# -gt 0 ] || { echo "usage: $0 <command...>"; exit 1; }
OUT=/root/update-watch-$(date +%H%M%S); mkdir -p "$OUT"
IOB=/opt/iobroker
read -r SP OP < <(cd $IOB && node -e 'const c=require("./iobroker-data/iobroker.json");console.log(c.states.port,c.objects.port)')

cat > "$OUT/ping.js" <<'JS'
// One PING per 250 ms to the states and objects server; per second the slowest answer.
// A PING without an answer yet counts as the time it has been waiting.
const net = require('net');
const [sp, op] = process.argv.slice(2).map(Number);
const conns = [sp, op].map((port) => {
    const c = { port, pending: null, worst: 0, s: net.connect(port, '127.0.0.1') };
    c.s.on('data', () => { if (c.pending) { c.worst = Math.max(c.worst, Date.now() - c.pending); c.pending = null; } });
    c.s.on('error', (e) => console.log(`${new Date().toTimeString().slice(0, 8)} port ${port}: ${e.message}`));
    return c;
});
setInterval(() => { for (const c of conns) if (!c.pending) { c.pending = Date.now(); c.s.write('*1\r\n$4\r\nPING\r\n'); } }, 250);
setInterval(() => {
    const t = new Date().toTimeString().slice(0, 8);
    const v = conns.map((c) => Math.max(c.worst, c.pending ? Date.now() - c.pending : 0));
    conns.forEach((c) => (c.worst = 0));
    console.log(`${t} states ${v[0]} ms  objects ${v[1]} ms${Math.max(...v) > 1000 ? '  <-- BLOCKED' : ''}`);
}, 1000);
JS
node "$OUT/ping.js" "$SP" "$OP" > "$OUT/ping.log" 2>&1 & PING=$!
vmstat -t 5 > "$OUT/vmstat.log" 2>&1 & VM=$!
( while true; do { echo "=== $(date +%T)"; top -b -n1 -o %CPU | head -20; } >> "$OUT/top.log"; sleep 10; done ) & TOP=$!
START=$(date '+%F %T')
echo "$(date +%T) start: $*" | tee "$OUT/cmd.log"
RUN=(); [ "$(id -u)" = 0 ] && RUN=(sudo -u iobroker)   # ioBroker refuses root
( cd $IOB && "${RUN[@]}" "$@" ) 2>&1 | while IFS= read -r l; do echo "$(date +%T) $l"; done >> "$OUT/cmd.log"
echo "$(date +%T) command done - watching ${AFTER:-240} s more (restarts, reconnects)" | tee -a "$OUT/cmd.log"
sleep "${AFTER:-240}"
kill $PING $VM $TOP 2>/dev/null
LOG=$(ls -t $IOB/log/iobroker.*.log | head -1)
awk -v s="$START" 'substr($0,1,19) >= s' "$LOG" | sed 's/\x1b\[[0-9;]*m//g' > "$OUT/iobroker.log"
echo
echo "Blocked seconds (> 1 s):"; grep -c BLOCKED "$OUT/ping.log"
grep BLOCKED "$OUT/ping.log" | head -5
echo "Results in $OUT - please send:  tar czf /root/update-watch.tgz -C $OUT ."
