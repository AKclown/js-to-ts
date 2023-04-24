import * as vscode from "vscode";
import { Main } from "./Main";

export class ApiToTsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "api.to.ts";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _main: Main
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this._extensionUri],
    };

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    webviewView.webview.html = this._getHtmlForWebview(
      webviewView.webview,
      nonce
    );

    webviewView.webview.onDidReceiveMessage((data) => {
      if (data.type === "pushData") {
        const code = this._main.apiToTs(JSON.stringify(data.value));
        if (this._view) {
          this._view.webview.postMessage({ type: "pullData", value: code });
        }
      } else if (data.type === "pushNonce") {
        if (this._view) {
          this._view.webview.postMessage({ type: "pullNonce", value: nonce });
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview, nonce: string) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );

    // Do the same for the stylesheet.
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.css")
    );

    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <!--
            Use a content security policy to only allow loading styles from our extension directory,
            and only allow scripts that have a specific nonce.
            (See the 'webview-sample' extension sample for img-src content security policy examples)
        -->
        
        <meta http-equiv="Content-Security-Policy" content="style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" connect-src 'self';>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    
        <link href="${styleResetUri}" rel="stylesheet">
        <link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleMainUri}" rel="stylesheet"> 
    
        <title>API TO TS</title>
      </head>
      <body>
        <article>
          <select id="method">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">HEAD</option>
            <option value="DELETE">DELETE</option>
          </select>
          <div>
            <p>Server URL</p>
            <input
              id="server-url"
              type="text"
              placeholder="Enter Your Server Url"
            />
          </div>
          <div>
            <p>Headers</p>
            <textarea
              name=""
              id="headers"
              placeholder="Enter Your Headers"
            ></textarea>
          </div>
          <div>
            <p>Params</p>
            <textarea
              name=""
              id="params"
              placeholder="Enter Your Params"
            ></textarea>
          </div>
          
          <div id = "types-container">
            <textarea id="types"></textarea>
            <button id="copy">COPY</button>
          </div>
          <p id="error"></p>
          <div id="loading">
            <div class="loader-container">
              <div class="loader-child"></div>
              <div class="loader-child"></div>
              <div class="loader-child"></div>
            </div>
          </div>
        </article>
        <button id="API-TO-TS">API-TO-TS</button>
    
    
        <script nonce="${nonce}" src="${scriptUri}"></script> 
      </body>
    </html>
    `;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
