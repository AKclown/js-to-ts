(function () {

    const vscode = acquireVsCodeApi();

    let nonce = '';

    document.querySelector('#API-TO-TS').addEventListener('click', () => {
        getData();
    });

    document.querySelector('#copy').addEventListener('click', () => {
        copyCode();
    });

    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        if ('pullData' === message.type) {
            toggle('types');
            document.querySelector('#types').value = message.value;
            copyCode(message.value);
        } else if ('pullNonce' === message.type) {
            nonce = message.value;
        }
    });

    // 获取到nonce
    pushNonce();

    function getData() {
        try {
            toggle('loading');
            const method = document.querySelector('#method').value;
            let serverUrl = document.querySelector('#server-url').value;
            let headers = document.querySelector('#headers').value.trim() || "{}";
            headers = headers.replace(/(\w+)\s*:/g, (match, p1) => `"${p1}":`).replace(/\'/g, "\"");
            headers = JSON.parse(headers);
            let params = document.querySelector('#params').value.trim() || "{}";
            params = params.replace(/(\w+)\s*:/g, (match, p1) => `"${p1}":`).replace(/\'/g, "\"");
            params = JSON.parse(params);

            if (serverUrl) {
                if (['GET', 'DELETE'].includes(method)) {
                    if (Object.keys(params).length) {
                        serverUrl = serverUrl + query(params);
                    }
                    fetch(serverUrl, {
                        method,
                        headers,
                    }).then(response => response.json())
                        .then(data => pushData(data))
                        .catch(error => printError(error));
                } else {
                    fetch(serverUrl, {
                        method,
                        headers,
                        body: JSON.stringify(params)
                    }).then(response => response.json())
                        .then(data => pushData(data))
                        .catch(error => printError(error));
                }
            } else {
                printError('ServerUrl cannot be empty');
            }
        } catch (error) {
            printError(error);
        }
    }

    // type: 'loading' | 'error' | 'types' | 'none'
    function toggle(type) {
        const typesDom = document.querySelector('#types-container');
        const errorDom = document.querySelector('#error');
        const loadingDom = document.querySelector('#loading');
        typesDom.style.display = type === 'types' ? 'block' : 'none';
        errorDom.style.display = type === 'error' ? 'block' : 'none';
        loadingDom.style.display = type === 'loading' ? 'flex' : 'none';
    }

    function printError(message) {
        toggle('error');
        document.querySelector('#error').innerHTML = message;
    }

    function pushData(data) {
        vscode.postMessage({ type: 'pushData', value: data });
    }

    function pushNonce() {
        vscode.postMessage({ type: 'pushNonce' });
    }

    function copyCode(code) {
        navigator.clipboard.writeText(code || document.querySelector('#types').value)
            .then(() => {
                console.log('Text copied to clipboard');
            })
            .catch(error => {
                printError(error.message);
            });
    }

    function query(obj) {
        if (obj) {
            let query = "";
            for (let i in obj) {
                let value = obj[i];
                if (Array.isArray(value)) {
                    value = value.join(",");
                }
                query += `&${i}=${value}`;
            }
            query = query.replace('&', '?');
            return query;
        }
        return "";
    }
})();