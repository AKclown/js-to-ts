(function () {

    const vscode = acquireVsCodeApi();

    document.querySelector('#API-TO-TS').addEventListener('click', () => {
        getData();
    });

    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        console.log('message: ', message);
        if ('pullData' === message.type) {
            toggleDisplay(false);
            document.querySelector('#types').value = message.value;
        }
    });

    function getData() {
        const method = document.querySelector('#method').value;
        // const serverUrl = document.querySelector('#server-url').value;
        const serverUrl = 'https://mock.presstime.cn/mock/64315e0835bc4b91ac0173a6/example/mock'
        const headers = document.querySelector('#headers').value.trim() || '{}';
        console.log('headers: ', headers);
        const params = document.querySelector('#params').value.trim() || '{}';
        console.log('params: ', params);

        if (serverUrl) {
            try {
                if (['GET', 'DELETE'].includes(method)) {
                    fetch(serverUrl)
                        .then(response => response.json())
                        .then(data => pushData(data))
                        .catch(error => printError(error));
                } else {
                    fetch(serverUrl, {
                        method,
                        headers: headers,
                        body: JSON.stringify(params)
                    }).then(response => response.json())
                        .then(data => pushData(data))
                        .catch(error => printError(error));
                }
            } catch (error) {
                printError(error.message);
            }
        } else {
            printError('ServerUrl cannot be empty');
        }
    }
    function toggleDisplay(isHidden) {
        document.querySelector('#types-container').style.display = isHidden ? 'none' : 'block';
        document.querySelector('#error').style.display = !isHidden ? 'none' : 'block';
    }

    function printError(message) {
        toggleDisplay(true);
        document.querySelector('#error').innerHTML = message;
    }

    function pushData(data) {
        vscode.postMessage({ type: 'pushData', value: data });
    }
})();