// 跨域: https://stackoverflow.com/questions/55841688/vscode-cross-origin-request-inside-webview
(function () {

    const vscode = acquireVsCodeApi();

    let nonce = '';

    document.querySelector('#method').addEventListener('click', (evt) => {
        const method = evt.target.value;
        const complex = document.querySelector('#complex-request');
        const swagger = document.querySelector('#swagger-request');
        const simple = document.querySelector('#simple-request');

        if (method === 'CURL') {
            complex.style.display = 'block';
            swagger.style.display = 'none';
            simple.style.display = 'none';
        } else if (method === 'SWAGGER') {
            complex.style.display = 'none';
            swagger.style.display = 'block';
            simple.style.display = 'none';
        } else {
            complex.style.display = 'none';
            swagger.style.display = 'none';
            simple.style.display = 'block';
        }
    });

    document.querySelector('#API-TO-TS').addEventListener('click', () => {
        getData();
    });

    document.querySelector('#copy').addEventListener('click', () => {
        copyCode();
    });

    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        if ('pullData' === message.type) {
            if (message.status === 'failed') {
                printError(message.value);
                return;
            }
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
            const curl = document.querySelector('#curl').value.trim() || '';
            const swagger = document.querySelector('#swagger').value.trim() || '';
            const swaggerPath = document.querySelector('#swagger-path').value.trim() || '';
            const method = document.querySelector('#method').value;
            let serverUrl = document.querySelector('#server-url').value;
            let headers = document.querySelector('#headers').value.trim() || "{}";
            headers = jsonToObject(headers);
            let params = document.querySelector('#params').value.trim() || "{}";
            params = jsonToObject(params);

            if (curl || swagger || serverUrl) {
                if (method === 'CURL') {
                    pushData(curl, { method });
                } else if (method === 'SWAGGER') {
                    fetch(`${swagger}`, {
                        method: 'get',
                    }).then(response => response.json())
                        .then(data => pushData(data, { method, path: swaggerPath }))
                        .catch(error => printError(error));
                } else if (['GET', 'DELETE'].includes(method)) {
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
                printError(`${method === 'CURL' ? 'Curl Url' : 'ServerUrl'} cannot be empty`);
            }
        } catch (error) {
            printError(error);
        }
    }

    function jsonToObject(json) {
        return JSON.parse(json.replace(/(\w+)\s*:/g, (match, p1) => `"${p1}":`)
            .replace(/\'/g, "\"")
            // 去掉末尾的,
            .replace(/,(\}|\])/g, (match, p1) => `${p1}`));
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

    function pushData(data, extras = {}) {
        vscode.postMessage({ type: 'pushData', value: data, extras });
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