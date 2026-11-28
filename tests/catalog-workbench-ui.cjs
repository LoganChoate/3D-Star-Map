// Test the local workbench in an isolated, headless Chromium browser.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const [binary, url, receipt] = process.argv.slice(2);
const origin = new URL(url).origin;
assert.equal(new URL(url).hostname, "127.0.0.1");
const sleep = () => new Promise(resolve => setTimeout(resolve, 60));

async function until(read) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        const value = await read();
        if (value) return value;
        await sleep();
    }
    throw new Error("The browser did not reach the expected state");
}

async function run() {
    const profile = fs.mkdtempSync(path.resolve(path.dirname(receipt), ".catalog-browser-"));
    const browser = spawn(binary, [
        "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        "--disable-background-networking", "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank",
    ], {windowsHide: true, stdio: "ignore"});
    browser.on("error", error => process.stderr.write(String(error) + "\n"));
    let socket;
    try {
        const port = await until(() => {
            if (browser.exitCode !== null) throw new Error("Browser quit with status " + browser.exitCode);
            try {
                return fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
            } catch (error) {
                if (!["ENOENT", "EBUSY"].includes(error.code)) throw error;
            }
        });
        const tabs = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
        const target = tabs.find(tab => tab.type === "page");
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            socket.addEventListener("open", resolve, {once: true});
            socket.addEventListener("error", reject, {once: true});
        });
        let counter = 0;
        const pending = new Map();
        const requests = [];
        socket.addEventListener("message", event => {
            const message = JSON.parse(event.data);
            if (message.id && pending.has(message.id)) {
                const {resolve, reject} = pending.get(message.id);
                pending.delete(message.id);
                if (message.error) reject(new Error(message.error.message));
                else resolve(message.result);
            }
            if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
        });
        const call = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++counter;
            pending.set(id, {resolve, reject});
            socket.send(JSON.stringify({id, method, params}));
        });
        const js = async expression => {
            const result = await call("Runtime.evaluate", {expression, returnByValue: true});
            if (result.exceptionDetails) throw new Error(expression + ": " + result.exceptionDetails.text);
            return result.result.value;
        };
        const check = async (label, expression) => {
            try { await until(() => js(expression)); }
            catch (error) { throw new Error(label, {cause: error}); }
            cases.push(label);
        };
        const cases = [];
        await call("Page.enable");
        await call("Network.enable");
        await call("Network.setBlockedURLs", {urls: ["https://*"]});
        await call("Page.navigate", {url});
        await check("The full catalog counter and 30-row first page render",
            'document.querySelectorAll("tbody tr").length===30 && /1[,. ]581[,. ]929/.test(document.getElementById("object-count").textContent)');
        await check("The workbench shows its exact catalog hash and local refresh status",
            '/^[a-f0-9]{64}$/.test(document.getElementById("snapshot").title) && /offline|previous accepted/.test(document.getElementById("release-status").textContent)');
        await js('document.getElementById("next").click()');
        await check("Next follows the page cursor", 'document.getElementById("page-label").textContent==="Page 2"');
        await js('document.getElementById("previous").click()');
        await check("Previous returns to the first page", 'document.getElementById("page-label").textContent==="Page 1"');
        const search = value => js('document.getElementById("query").value=' + JSON.stringify(value)
            + '; document.getElementById("search-form").requestSubmit()');
        await search("Skadi");
        await until(() => js('document.querySelector(".result-name")?.textContent==="Skathi"'));
        await js('document.querySelector(".result-name").click()');
        await check("An old moon name opens the correct dossier and flags pending validity",
            'document.getElementById("dossier-title").textContent==="Skathi" && document.getElementById("dossier-content").textContent.includes("Awaiting validation")');
        await js('document.getElementById("close-dossier").click()');
        await search("zzzz_no_catalog_match");
        await check("A search with zero matches shows the empty-results state",
            'document.getElementById("status").dataset.state==="empty"');
        await js('document.querySelector("[data-view=assets]").click(); document.getElementById("asset-target").value="Charon"; document.getElementById("asset-kind").value="terrain"; document.getElementById("search-form").requestSubmit()');
        await until(() => js('document.querySelectorAll("tbody tr").length===1 && document.querySelector("tbody").textContent.includes("300 m/px")'));
        await js('document.querySelector(".result-name").click()');
        await check("Charon terrain filters and the product dossier show the recorded resolution and size",
            'document.getElementById("dossier-content").textContent.includes("161,176,369")');
        await check("A source entry with no retained Charon raster does not appear downloaded",
            'document.getElementById("dossier-content").textContent.includes("No verified local copy registered")');
        await call("Emulation.setDeviceMetricsOverride", {width: 395, height: 760, mobile: false, deviceScaleFactor: 1});
        await check("The narrow layout fits the viewport",
            "window.innerWidth===395 && document.documentElement.scrollWidth<=window.innerWidth");
        const hasScience = await call("Runtime.evaluate", {
            expression: 'fetch("/api/options").then(r=>r.json()).then(r=>r.scienceReviewLoaded)',
            awaitPromise:true, returnByValue:true,
        });
        if (hasScience.result.value) {
            await js('document.getElementById("close-dossier").click(); document.querySelector("[data-view=objects]").click();');
            await search("solar:uranus");
            await until(() => js('document.querySelector(".result-name")?.textContent==="Uranus"'));
            await js('document.querySelector(".result-name").click()');
            await check("Uranus dossier separates checked historical samples from the prior source disagreement",
                'document.getElementById("dossier-content").textContent.includes("different Sun-center solution") && document.getElementById("dossier-content").textContent.includes("Checked historical samples")');
            await js('document.getElementById("close-dossier").click()');
            await search("norad:25544");
            await until(() => js('document.querySelector("tbody .result-name")?.textContent==="ISS (ZARYA)"'));
            await js('document.querySelector("tbody .result-name").click()');
            try {
                await check("The station shows the bounded offline model window without claiming live position",
                    '/Within the model window|Outside the model window/.test(document.getElementById("dossier-content").textContent)');
            } catch (error) {
                const shown = await js('document.getElementById("dossier-title").textContent + " — " + document.getElementById("dossier-content").textContent.slice(0, 700)');
                throw new Error(error.message + ". The browser showed " + shown, {cause: error});
            }
        }
        const external = requests.filter(value => /^(https?|wss?):/i.test(value) && new URL(value).origin !== origin);
        assert.deepEqual(external, []);
        const report = {status:"passed", cases, externalRequests:external.length,
            requestedRoutes:[...new Set(requests.filter(value => value.startsWith(origin)).map(value => new URL(value).pathname))].sort()};
        fs.writeFileSync(receipt, JSON.stringify(report, null, 2) + "\n");
        process.stdout.write(JSON.stringify(report) + "\n");
    } finally {
        socket?.close();
        if (browser.exitCode === null) browser.kill();
    }
}

run().catch(error => { process.stderr.write(String(error.stack ?? error) + "\n"); process.exit(1); });
