import { window } from "vscode";
import * as t from "@babel/types";
import generate from "@babel/generator";
import traverse, { NodePath, Visitor } from "@babel/traverse";
import { ParseResult, parse } from "@babel/parser";
import { v4 as uuidv4 } from "uuid";
import { BaseClass } from "./BaseClass";
import { IMain } from "./interface/Main.interface";

export enum AstTypeEnum {
  identifier = "Identifier",
  stringLiteral = "StringLiteral",
  numericLiteral = "NumericLiteral",
  booleanLiteral = "BooleanLiteral",
  nullLiteral = "NullLiteral",
  templateLiteral = "TemplateLiteral",
  bigintLiteral = "BigintLiteral",
  newExpression = "NewExpression",
  callExpression = "CallExpression",
  objectExpression = "ObjectExpression",
  arrayExpression = "ArrayExpression",
}

// TODO: Promise<T>
enum TsParamsEnum {
  tSTypeParameterInstantiation = "TSTypeParameterInstantiation",
  tSAnyKeyword = "tSAnyKeyword",
  tSNeverKeyword = "tSNeverKeyword",
  tSNullKeyword = "TSNullKeyword",
  tSNumberKeyword = "TSNumberKeyword",
  tSStringKeyword = "TSStringKeyword",
  tSSymbolKeyword = "TSSymbolKeyword",
  tSUndefinedKeyword = "TSUndefinedKeyword",
  tSUnknownKeyword = "TSUnknownKeyword",
  tSVoidKeyword = "TSVoidKeyword",
  tSUnionType = "TSUnionType",
  tSIntersectionType = "TSIntersectionType",
}

export class Main extends BaseClass implements IMain {
  private nameRegular = /([a-zA-Z]*)(«(?:[\w|«|»])+»)?(?:\s)*(\{)/m;
  private contentRegular = /(\w+).*\(([^,]+).*\)((?:\:)([^,|}|\r|\n]+))?/g;
  private blockRegular = /([^\{]*\{)([^\{\}]+)(\})/gm;

  // *********************
  // Add Block Command
  // *********************

  /** 添加注释 */
  addBlockComments() {
    // TODO: 未完成
    const editor = window.activeTextEditor;
    if (editor) {
      const active = editor.selection.active;
      editor.edit((editorContext) => {
        editorContext.insert(active, `/**  */`);
      });
      this.setCursorPosition(active.line, active.character + 4);
    }
  }

  // *********************
  // Swagger To TS
  // *********************

  /** 执行转换 */
  executeConverts() {
    try {
      const selectData = this.getSelectedInfo();

      const editor = window.activeTextEditor;
      if (!editor) {
        return;
      }
      selectData.forEach((item) => {
        const { text, range } = item;
        // 将数据分为区域 ~{(第一块) {}(里面的内容第二块) }(第三块)
        let blocks = null;
        // 数据string
        let formatText = "";

        while ((blocks = this.blockRegular.exec(text))) {
          const interfaceText = this.getInterface(blocks[1]);
          const content = this.getContent(blocks[2]);
          formatText = `${formatText}
${interfaceText.trim()}${content}
}
  `;
        }
        editor.edit((editorContext) =>
          editorContext.replace(range, formatText)
        );
      });
    } catch (error) {
      console.log("error: ", error);
    }
  }

  /** 获取interface模板 */
  getInterface(text: string): string {
    const names = text.match(this.nameRegular);
    return names ? `export interface ${names[1]} ${names[3]}\n\t` : "";
  }

  /** 获取内容类型模板 */
  getContent(text: string): string {
    let contents = null;
    let contentText = "";
    while ((contents = this.contentRegular.exec(text))) {
      let note = contents[4] ? `/** ${contents[4].trim()} */` : "";
      const type = this.formatType(contents[2]);
      contentText = `${contentText}
  ${note}
  ${contents[1].trim()}?:${type};`;
    }
    return contentText;
  }

  /** 类型格式化 */
  formatType(type: string): string {
    if (type === "integer") {
      return "number";
    } else if (type.search(/Array/g) !== -1) {
      const mat = type.match(/(?:\[)(.*)(?:\])/);
      return mat ? mat[1] : "unknown";
    }
    return type;
  }

  // *********************
  // API TO TS
  // *********************

  apiToTs(code: string) {
    // try {
    const tsCode = this.parseCode(code);
    return tsCode;
    // } catch (error) {
    //   return "异常";
    // }
  }

  // *********************
  // JS To TS
  // *********************

  jsToTs() {
    const selectData = this.getSelectedInfo();
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }
    selectData.forEach((item) => {
      const { text, range } = item;
      const code = this.parseCode(text);
      editor.edit((editorContext) => editorContext.replace(range, code));
    });
  }

  // *********************
  // COMMENT
  // *********************

  parseCode(text: string): string {
    const regualar = /(var|let|const)\s*\w+\s*=.*/;
    let updateText = text;
    // 判断是否存在变量
    if (!regualar.test(updateText)) {
      // 不能存在分号
      const firstChar = String.fromCharCode(
        Math.floor(Math.random() * 26) + 97
      );
      const variableName = uuidv4().slice(0, 3);
      updateText = `const ${firstChar}${variableName} = ${updateText}`
        .trimRight()
        .replace(/;$/, "");
    }
    console.log("updateText: ", updateText);

    const ast: ParseResult<t.File> = parse(updateText, {
      plugins: ["typescript"],
    });
    this.traverseCode(ast);
    const code = generate(ast).code;
    return code;
  }

  // *********************
  // Traverse
  // *********************

  traverseCode(ast: ParseResult<t.File>) {
    const declaration = (ast.program.body[0] as t.VariableDeclaration)
      .declarations[0];
    const type = declaration!.init!.type;
    if (type === AstTypeEnum.objectExpression) {
      traverse(ast, this.ObjectVisitor);
    } else if (type === AstTypeEnum.arrayExpression) {
      traverse(ast, this.ArrayVisitor);
    }

    traverse(ast, this.VariableVisitor);
  }

  // *********************
  // Visitor
  // *********************

  /** 对象Visitor */
  get ObjectVisitor(): Visitor<t.Node> {
    const _that = this;
    return {
      ObjectProperty(path: NodePath<t.ObjectProperty>, state: any = {}) {
        const value = path.node.value;
        let typeAnnotation: t.TSType = t.tsUnknownKeyword();
        if (t.isStringLiteral(value) || t.isTemplateLiteral(value)) {
          typeAnnotation = t.tsStringKeyword();
        } else if (
          t.isBigIntLiteral(value) ||
          t.isDecimalLiteral(value) ||
          t.isNumericLiteral(value)
        ) {
          typeAnnotation = t.tsNumberKeyword();
        } else if (t.isBooleanLiteral(value)) {
          typeAnnotation = t.tsBooleanKeyword();
        } else if (t.isNullLiteral(value)) {
          typeAnnotation = t.tsNullKeyword();
        } else if (t.isRegExpLiteral(value)) {
          typeAnnotation = t.tsTypeReference(t.identifier("RegExp"));
        } else if (t.isIdentifier(value)) {
          if (value.name === "undefined") {
            typeAnnotation = t.tsUndefinedKeyword();
          } else if (value.name === "Symbol") {
            typeAnnotation = t.tsSymbolKeyword();
          }
        } else if (t.isNewExpression(value)) {
          const calleeName = generate((value as t.NewExpression).callee).code;
          if (calleeName === "Promise") {
            typeAnnotation = t.tsTypeReference(
              t.identifier(`${calleeName}<unknown>`)
            );
          } else {
            typeAnnotation = t.tsTypeReference(t.identifier(calleeName));
          }
        } else if (t.isCallExpression(value)) {
          const calleeName = generate((value as t.CallExpression).callee).code;
          typeAnnotation = t.tsTypeReference(t.identifier(calleeName));
        } else if (t.isArrowFunctionExpression(value)) {
          // TODO: 未完成
          // typeAnnotation = t.tsFunctionType(null, []);
        } else if (t.isArrayExpression(value)) {
          if (value.elements.length) {
            const id = uuidv4().slice(0, 4);
            state.levelRecord = [];
            state.parentArrayRerencefeName = `I${id}`;
            // 判断子元素是否为ObjectExpression
            if (
              value.elements.length === 1 &&
              t.isObjectExpression(value.elements[0]) &&
              _that.isALLKeySame(
                path.get("value") as NodePath<t.ArrayExpression>
              )
            ) {
              const variable = path.findParent((path) =>
                path.isVariableDeclarator()
              )!;
              // name为undefined表示 当前Node是第二层对象因此需要使用变量名为interface变量
              const variableName = `I${
                ((variable.node as t.VariableDeclarator).id as t.Identifier)
                  .name
              }`;
              const name = state.parentRerencefeName ?? variableName;
              typeAnnotation = t.tsTypeReference(
                t.identifier(`Array<${name}>`)
              );
            } else {
              path.get("value").traverse(_that.ArrayVisitor, state);
              // 生成一个新的变量
              const variable = t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier(`I${id}`),
                  path.node.value as t.ArrayExpression
                ),
              ]);
              const programNode = path.findParent((path) => path.isProgram())!;
              (programNode.node as t.Program).body.push(variable);
              typeAnnotation = t.tsTypeReference(t.identifier(`Array<I${id}>`));
            }
          } else {
            typeAnnotation = t.tsTypeReference(t.identifier(`Array<unknown>`));
          }
          path.skip();
        } else if (t.isObjectExpression(value)) {
          if (_that.isALLKeySame(path)) {
            const variable = path.findParent((path) =>
              path.isVariableDeclarator()
            )!;
            // name为undefined表示 当前Node是第二层对象因此需要使用变量名为interface变量
            const variableName = `I${
              ((variable.node as t.VariableDeclarator).id as t.Identifier).name
            }`;
            const name = state.parentRerencefeName ?? variableName;
            typeAnnotation = t.tsTypeReference(t.identifier(name));
          } else {
            const id = uuidv4().slice(0, 4);
            state.parentRerencefeName = `I${id}`;
            path.get("value").traverse(_that.ObjectVisitor, state);
            // 生成一个新的变量
            const variable = t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier(id),
                path.node.value as t.ObjectExpression
              ),
            ]);
            const programNode = path.findParent((path) => path.isProgram())!;
            (programNode.node as t.Program).body.push(variable);
            typeAnnotation = t.tsTypeReference(t.identifier(`I${id}`));
          }

          path.skip();
        }

        let key = path.node.key as t.Expression;

        if (!(key as t.Identifier)?.name) {
          // 判断类型声明是不是复杂名称，例如包含了-
          const regualar = /[^(\w|_|$)]/g;
          const value = (key as t.StringLiteral).value;
          if (!regualar.test(value)) {
            // 不是复杂类型转换为Identifier
            key = t.identifier(value);
          }
        }

        const node = t.tsPropertySignature(
          key,
          t.tsTypeAnnotation(typeAnnotation)
        );
        path.replaceWith(node);
      },
    };
  }

  /** 数组处理 */
  get ArrayVisitor(): any {
    const _that = this;
    return {
      ObjectExpression(path: NodePath<t.ObjectExpression>, state: any = {}) {
        if (_that.isALLKeySame(path)) {
          const variable = path.findParent((path) =>
            path.isVariableDeclarator()
          )!;
          // name为undefined表示 当前Node是第二层对象因此需要使用变量名为interface变量
          const variableName = `I${
            ((variable.node as t.VariableDeclarator).id as t.Identifier).name
          }`;
          const name = state.parentRerencefeName ?? variableName;
          path.replaceWith(t.tsTypeReference(t.identifier(name)));
        } else {
          state.parentRerencefeName = state.parentArrayRerencefeName;
          path.traverse(_that.ObjectVisitor, state);
          path.replaceWith(
            t.tsTypeLiteral(
              path.node.properties as unknown as t.TSTypeElement[]
            )
          );
        }
        path.skip();
      },
      ArrayExpression(path: NodePath<t.ArrayExpression>, state: any = {}) {
        state.levelRecord = [];
        // 判断最外层是否为数组
        if (path.parent.type !== "VariableDeclarator") {
          if (path.node.elements.length) {
            path.traverse(_that.ArrayVisitor, state);
            path.replaceWith(
              t.tsArrayType(
                t.tsUnionType(path.node.elements as unknown as t.TSType[])
              )
            );
          } else {
            path.replaceWith(t.tsArrayType(t.tsUnknownKeyword()));
          }
        } else {
          if (path.node.elements.length) {
            path.traverse(_that.ArrayVisitor, state);
            // TODO:
          } else {
            path.replaceWith(t.tsArrayType(t.tsUnknownKeyword()));
          }
        }
        path.skip();
      },
      "StringLiteral|TemplateLiteral"(
        path: NodePath<t.Literal>,
        state: any = {}
      ) {
        if (state.levelRecord.includes("string")) {
          path.remove();
        } else {
          path.replaceWith(t.tsStringKeyword());
          state.levelRecord.push("string");
        }
      },
      "NumericLiteral|BigIntLiteral|DecimalLiteral"(
        path: NodePath<t.Literal>,
        state: any = {}
      ) {
        if (state.levelRecord.includes("number")) {
          path.remove();
        } else {
          path.replaceWith(t.tsNumberKeyword());
          state.levelRecord.push("number");
        }
      },
      BooleanLiteral(path: NodePath<t.BooleanLiteral>, state: any = {}) {
        if (state.levelRecord.includes("boolean")) {
          path.remove();
        } else {
          path.replaceWith(t.tsBooleanKeyword());
          state.levelRecord.push("boolean");
        }
      },
      NullLiteral(path: NodePath<t.NullLiteral>, state: any = {}) {
        if (state.levelRecord.includes("null")) {
          path.remove();
        } else {
          path.replaceWith(t.tsNullKeyword());
          state.levelRecord.push("null");
        }
      },
      Identifier(path: NodePath<t.Identifier>, state: any = {}) {
        if (path.parent.type !== "VariableDeclarator") {
          if (
            path.node.name === "undefined" &&
            !state.levelRecord.includes("undefined")
          ) {
            path.replaceWith(t.tsUndefinedKeyword());
            state.levelRecord.push("undefined");
          } else if (!state.levelRecord.includes("unknown")) {
            path.replaceWith(t.tsUnknownKeyword());
            state.levelRecord.push("unknown");
          }
          path.remove();
        }
      },
    };
  }

  /** 变量处理 */
  get VariableVisitor(): Visitor<t.Node> {
    return {
      VariableDeclaration(path: NodePath<t.VariableDeclaration>) {
        let declarations = path.node.declarations
          .map((declaration) => {
            const name = (declaration.id as t.Identifier).name;
            if (t.isObjectExpression(declaration.init)) {
              return t.tsInterfaceDeclaration(
                t.identifier(`I${name}`),
                null,
                null,
                t.tsInterfaceBody(
                  (declaration.init as t.ObjectExpression)
                    .properties as unknown as Array<t.TSTypeElement>
                )
              );
            } else if (t.isArrayExpression(declaration.init)) {
              return t.tsTypeAliasDeclaration(
                t.identifier(`${name}`),
                null,
                t.tSUnionType(
                  (declaration.init as t.ArrayExpression)
                    .elements as unknown as Array<t.TSType>
                )
              );
            }
          })
          .filter(Boolean) as Array<
          t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration
        >;

        path.replaceWithMultiple(declarations);
      },
    };
  }

  // *********************
  // Utils Funtion
  // *********************

  /** 父子key是否一致 */
  isALLKeySame(
    path: NodePath<t.ObjectProperty | t.ObjectExpression | t.ArrayExpression>
  ): boolean {
    // 找到最近一个父节点为"ObjectExpression"的Node
    const parentObject = path.findParent((path) => path.isObjectExpression());
    const parentProps =
      (parentObject?.node as t.ObjectExpression).properties ?? [];

    let chlidNode = path.node as t.ObjectExpression;
    if (path.node.type === "ObjectProperty") {
      chlidNode = path.node.value as t.ObjectExpression;
    } else if (path.node.type === "ArrayExpression") {
      chlidNode = path.node.elements[0] as t.ObjectExpression;
    }

    const childProps = chlidNode.properties ?? [];

    // 获取到所有的key
    const parentKeys = parentProps.map(
      (props) => ((props as t.ObjectProperty).key as t.Identifier).name
    );
    const childKeys = childProps.map(
      (props) => ((props as t.ObjectProperty).key as t.Identifier).name
    );

    if (
      childKeys.length &&
      parentKeys.length === childKeys.length &&
      childKeys.every((key) => parentKeys.includes(key))
    ) {
      return true;
    }
    return false;
  }
}
