(function () {
    document.querySelector('#API-TO-TS').addEventListener('click', () => {
        getData()
    });

    function getData() {
        const method = document.querySelector('#method').value;
        const serverUrl = document.querySelector('#server-url').value;
        const headers = document.querySelector('#headers').value.trim() || '{}';
        console.log('headers: ', headers);
        const params = document.querySelector('#params').value.trim() || '{}';
        console.log('params: ', params);

        if (serverUrl) {
            try {
                if (['GET', 'DELETE'].includes(method)) {
                    fetch(serverUrl)
                        .then(response => response.json())
                        .then(data => console.log(data))
                        .catch(error => printError(error));
                } else {
                    fetch(serverUrl, {
                        method,
                        headers: headers,
                        body:JSON.stringify(params) 
                    }).then(response => response.json())
                        .then(data => console.log(data))
                        .catch(error => printError(error));
                }
            } catch (error) {
                printError(error.message);
            }
        } else {
            printError('ServerUrl cannot be empty')
        }
    }

    function printError(message) {
        document.querySelector('#error').innerHTML = message;
    }
})()