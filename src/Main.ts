import { window } from "vscode";
import * as t from "@babel/types";
import generate from "@babel/generator";
import traverse, { NodePath, Visitor } from "@babel/traverse";
import { ParseResult, parse } from "@babel/parser";
import { v4 as uuids4 } from "uuid";
import { BaseClass } from "./BaseClass";
import { IMain } from "./interface/Main.interface";
import { Logger } from "./Logger";
import { ErrorEnum } from "./interface/Logger.interface";
import { CustomConfig, Icomments } from "./constant";
import {  Position, Range } from "vscode";
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

  private newVarible: Map<string, string>;
  constructor() {
    super();
    this.newVarible = new Map([]);
  }

  // *********************
  // Add Block Command
  // *********************

  /** 添加注释 */
  addBlockComments() {
    // TODO: 未完成
    const editor = window.activeTextEditor;
    const data = this.getSelectedInfo();
    const hasSelect = !!data.length;
    if (editor) {
      const active = editor.selection.active;
      editor.edit((editorContext) => {
        if (!hasSelect) {
          /** 未选中任何内容 */
          editorContext.insert(active, `/**  */`);
          return;
        }

        data.forEach(item => {
          const { range: { start, end } } = item;
          console.log('start: ', start);
          if (start.line === end.line) {
            /** 选中单行 */
            editorContext.replace(item.range, `/** ${item.text} */`);
          } else {
            /** 选中多行 */

            // 默认从该行第一个文本开始选择
            const newPosition = new Position(start.line, 0);
            const text = this.getActiveTextByStartEnd(newPosition, end);
            // 取出最小空格
            const minSpaceNum = text.split(/\n/g).reduce((prev, cur) => Math.min(cur.length - cur.trimStart().length, prev), Number.MAX_SAFE_INTEGER);
            const spaceStr = ' '.repeat(minSpaceNum);
            // 将第二行开始的所有空格删掉minSpaceNum个，然后删掉第一行的minSpaceNum个空格
            const replaceText = text.replace(/\n\s*/g, v => `${spaceStr} * ${v.slice(minSpaceNum || 1)}`).slice(minSpaceNum - 1 >= 0 ? minSpaceNum - 1 : 0);
            const range = new Range(newPosition, end);
            editorContext.replace(range, `${spaceStr}/**\n ${spaceStr}* ${replaceText}\n${spaceStr} */`);
          }
        });

        // editorContext.insert(active, `/**  */`);
      });
      if(!hasSelect) {
        this.setCursorPosition(active.line, active.character + 4);
      }
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
    } catch (error: any) {
      Logger.error({
        type: ErrorEnum.UNKNOWN_MISTAKE,
        data: error.message,
        items: ["OpenIssue"],
      });
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
    try {
      const tsCode = this.parseCode(code);
      return tsCode;
    } catch (error: any) {
      Logger.error({
        type: ErrorEnum.UNKNOWN_MISTAKE,
        data: error.message,
        items: ["OpenIssue"],
      });
      return error.message;
    }
  }

  // *********************
  // JS To TS
  // *********************

  async jsToTs() {
    try {
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        return;
      }

      const selectData = this.getSelectedInfo();
      if (selectData.length) {
        selectData.forEach(async (item) => {
          const { text, range } = item;
          let updateText = text;
          if (range.start === range.end) {
            // 不是选择区域时，从剪切板获取内容
            updateText = await this.getCodeByClipboard();
          }
          const code = this.parseCode(updateText);

          // 是否打开临时文件展示内容
          const openTemporaryFile = this.getConfig(
            CustomConfig.OPEN_TEMPORARY_FILE
          ) as boolean;

          if (openTemporaryFile) {
            this.openTemporaryFile(code);
          } else {
            activeEditor.edit((editorContext) =>
              editorContext.replace(range, code)
            );
          }
        });
      } else {
        this.updateCodeByClipboard();
      }
    } catch (error: any) {
      Logger.error({
        type: ErrorEnum.UNKNOWN_MISTAKE,
        data: error.message,
        items: ["OpenIssue"],
      });
    }
  }

  // *********************
  // Parse
  // *********************

  parseCode(text: string): string {
    this.newVarible.clear();
    const regular = /(var|let|const)\s*\w+\s*=.*/;
    let updateText = text;
    // 判断是否存在变量
    if (!regular.test(updateText)) {
      // 不能存在分号
      const firstChar = String.fromCharCode(
        Math.floor(Math.random() * 26) + 97
      );
      const variableName = uuids4().slice(0, 3);
      updateText = `const ${firstChar}${variableName} = ${updateText}`
        .trimRight()
        .replace(/;$/, "");
    }

    const ast: ParseResult<t.File> = parse(updateText, {
      plugins: ["typescript"],
    });
    this.traverseCode(ast);
    const code = generate(ast, {
      jsescOption: {
        quotes: 'single'
      }
    }).code;
    return code;
  }

  // *********************
  // Traverse
  // *********************

  // TODO: 暂未优化 (后续单独成拆成一个npm包 - 二进制包)
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
    const prefix = this.getConfig(CustomConfig.PREFIX) as string;
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
            const id = uuids4().slice(0, 4);
            state.levelRecord = [];

            // 元素类型只存在基础类型，不生成新的interface定义
            const complexTypes = value.elements.some(
              (element) => !(t.isLiteral(element) || t.isIdentifier(element) || t.isUnaryExpression(element))
            );

            if (complexTypes) {
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
                const variableName = `${prefix}${((variable.node as t.VariableDeclarator).id as t.Identifier)
                  .name
                  }`;
                // TODO: 可优化
                const name = state.parentReferenceName ?? variableName;
                typeAnnotation = t.tsTypeReference(
                  t.identifier(`Array<${name}>`)
                );
              } else {
                // !!! 存在问题
                state.parentArrayReferenceName = `${prefix}${id}`;
                path.get("value").traverse(_that.ArrayVisitor, state);

                // 类型去重
                let elements = (path.node.value as t.ArrayExpression).elements;
                (path.node.value as t.ArrayExpression).elements = _that.typeIntegration(elements);

                // 生成一个新的变量(判断是否存在一样的数据)
                const variableExpression = generate(path.node.value).code;
                const reusableId = _that.reusableId(variableExpression);

                if (!reusableId) {
                  const variable = t.variableDeclaration("const", [
                    t.variableDeclarator(
                      t.identifier(id),
                      path.node.value as t.ArrayExpression
                    ),
                  ]);
                  const programNode = path.findParent((path) =>
                    path.isProgram()
                  )!;
                  (programNode.node as t.Program).body.push(variable);
                  _that.newVarible.set(id, variableExpression);
                }
                typeAnnotation = t.tsTypeReference(
                  t.identifier(`Array<${prefix}${reusableId ?? id}>`)
                );
              }
            } else {
              // 基础类型
              path.get("value").traverse(_that.ArrayVisitor, state);
              typeAnnotation = t.tsArrayType(
                t.tsUnionType(
                  (path.node.value as t.ArrayExpression)
                    .elements as unknown as t.TSType[]
                )
              );
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
            const variableName = `${prefix}${((variable.node as t.VariableDeclarator).id as t.Identifier).name
              }`;
            const name = state.parentReferenceName ?? variableName;
            typeAnnotation = t.tsTypeReference(t.identifier(name));
          } else {
            const id = uuids4().slice(0, 4);
            // !!! 这里还是要考虑直接获父元素的
            state.parentReferenceName = `${prefix}${id}`;
            path.get("value").traverse(_that.ObjectVisitor, state);

            // 生成一个新的变量(判断是否存在一样的数据)
            const variableExpression = generate(path.node.value).code;
            const reusableId = _that.reusableId(variableExpression);

            if (!reusableId) {
              // 生成一个新的变量
              const variable = t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.identifier(id),
                  path.node.value as t.ObjectExpression
                ),
              ]);
              const programNode = path.findParent((path) => path.isProgram())!;
              (programNode.node as t.Program).body.push(variable);
              _that.newVarible.set(id, variableExpression);
            }

            typeAnnotation = t.tsTypeReference(t.identifier(`${prefix}${reusableId ?? id}`));
          }

          path.skip();
        }

        let key = path.node.key as t.Expression;

        if (!(key as t.Identifier)?.name) {
          // 判断类型声明是不是复杂名称，例如包含了-
          const regular = /[^(\w|_|$)]/g;
          const value = (key as t.StringLiteral).value;
          if (!regular.test(value)) {
            // 不是复杂类型转换为Identifier
            key = t.identifier(value);
          }
        }

        const node = t.tsPropertySignature(
          key,
          t.tsTypeAnnotation(typeAnnotation)
        );

        // 属性是否为可选
        const optional = _that.getConfig(CustomConfig.OPTIONAL) as boolean;
        node.optional = optional;

        path.replaceWith(node);
        // 是否保留注释
        _that.retainComments(path);

      },
    };
  }

  /** 数组处理 */
  get ArrayVisitor(): any {
    const _that = this;
    const prefix = this.getConfig(CustomConfig.PREFIX) as string;
    return {
      ObjectExpression(path: NodePath<t.ObjectExpression>, state: any = {}) {
        if (_that.isALLKeySame(path)) {
          const variable = path.findParent((path) =>
            path.isVariableDeclarator()
          )!;
          // name为undefined表示 当前Node是第二层对象因此需要使用变量名为interface变量
          const variableName = `${prefix}${((variable.node as t.VariableDeclarator).id as t.Identifier).name
            }`;
          const name = state.parentReferenceName ?? variableName;
          path.replaceWith(t.tsTypeReference(t.identifier(name)));
        } else {
          state.parentReferenceName = state.parentArrayReferenceName;
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
            // 类型去重
            let elements = (path.node as t.ArrayExpression).elements;
            (path.node as t.ArrayExpression).elements = _that.typeIntegration(elements);

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
          // 是否保留注释
          _that.retainComments(path);
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
          // 是否保留注释
          _that.retainComments(path);
          state.levelRecord.push("number");
        }
      },
      UnaryExpression(
        path: NodePath<t.UnaryExpression>,
        state: any = {}
      ) {
        // TODO: UnaryExpression未穷举完所有情况
        if (state.levelRecord.includes("number")) {
          path.remove();
        } else {
          path.replaceWith(t.tsNumberKeyword());
          // 是否保留注释
          _that.retainComments(path);
          state.levelRecord.push("number");
        }
      },
      BooleanLiteral(path: NodePath<t.BooleanLiteral>, state: any = {}) {
        if (state.levelRecord.includes("boolean")) {
          path.remove();
        } else {
          path.replaceWith(t.tsBooleanKeyword());
          // 是否保留注释
          _that.retainComments(path);
          state.levelRecord.push("boolean");
        }
      },
      NullLiteral(path: NodePath<t.NullLiteral>, state: any = {}) {
        if (state.levelRecord.includes("null")) {
          path.remove();
        } else {
          path.replaceWith(t.tsNullKeyword());
          // 是否保留注释
          _that.retainComments(path);
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
          // 是否保留注释
          _that.retainComments(path);
          path.remove();
        }
      },
    };
  }

  /** 变量处理 */
  get VariableVisitor(): Visitor<t.Node> {
    const _that = this;
    const prefix = this.getConfig(CustomConfig.PREFIX) as string;
    return {
      VariableDeclaration(path: NodePath<t.VariableDeclaration>) {
        // 是否追加export
        const exportType = _that.getConfig(CustomConfig.EXPORT_TYPE) as boolean;

        let declarations = path.node.declarations
          .map((declaration) => {
            const name = (declaration.id as t.Identifier).name;
            if (t.isObjectExpression(declaration.init)) {
              const tsDeclaration = t.tsInterfaceDeclaration(
                t.identifier(`${prefix}${name}`),
                null,
                null,
                t.tsInterfaceBody(
                  (declaration.init as t.ObjectExpression)
                    .properties as unknown as Array<t.TSTypeElement>
                )
              );
              if (exportType) {
                return t.exportNamedDeclaration(tsDeclaration, []);
              }
              return tsDeclaration;
            } else if (t.isArrayExpression(declaration.init)) {
              // 判断是不是原始数组
              const isOriginalArray = !name.startsWith(`${prefix}`);
              let elements = (declaration.init as t.ArrayExpression).elements;
              let typeAnnotation: t.TSType = elements.length
                ? t.tSUnionType(elements as unknown as Array<t.TSType>)
                : t.tsUnknownKeyword();

              // 判断存在问题
              // if (isOriginalArray) {
              //   typeAnnotation = t.tsArrayType(typeAnnotation);
              // }

              const tsDeclaration = t.tsTypeAliasDeclaration(
                t.identifier(`${prefix}${name}`),
                null,
                typeAnnotation
              );

              if (exportType) {
                return t.exportNamedDeclaration(tsDeclaration, []);
              }
              return tsDeclaration;
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
  // Utils Function
  // *********************

  /** 父子key是否一致 */
  isALLKeySame(
    path: NodePath<t.ObjectProperty | t.ObjectExpression | t.ArrayExpression>
  ): boolean {
    // 找到最近一个父节点为"ObjectExpression"的Node
    const parentObject = path.findParent((path) => path.isObjectExpression());
    const parentProps =
      (parentObject?.node as t.ObjectExpression).properties ?? [];

    let childNode = path.node as t.ObjectExpression;
    if (path.node.type === "ObjectProperty") {
      childNode = path.node.value as t.ObjectExpression;
    } else if (path.node.type === "ArrayExpression") {
      childNode = path.node.elements[0] as t.ObjectExpression;
    }

    const childProps = childNode.properties ?? [];

    // 获取到所有的key
    const parentKeys = parentProps.map(
      (props) => {
        const key = (props as t.ObjectProperty).key;
        if (t.isIdentifier(key)) {
          return key.name;
        } else if (t.isStringLiteral(key)) {
          return key.value;
        }
      }
    );
    const childKeys = childProps.map(
      (props) => {
        const key = (props as t.ObjectProperty).key;
        if (t.isIdentifier(key)) {
          return key.name;
        } else if (t.isStringLiteral(key)) {
          return key.value;
        }
      }
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

  /** 从剪切板更新内容 */
  async updateCodeByClipboard() {
    // 从粘贴板获取内容
    const code = await this.getCodeByClipboard();
    const updateCode = this.parseCode(code);
    this.openTemporaryFile(updateCode);
  }

  /** 数组对象类型整合 */
  typeIntegration(elements: Array<t.Expression | t.SpreadElement | null>) {
    // 对象数据数据整合在一起成为联合类型
    const typeMap: Map<string, Array<t.TSTypeAnnotation>> = new Map([]);
    // 基础类型
    const basics: Array<any> = [];
    // 复杂类型
    const complexs: Array<t.TSTypeLiteral> = [];
    elements.forEach(element => {
      if (t.isTSTypeLiteral(element)) {
        complexs.push(element);
      } else {
        basics.push(element);
      }
    });

    if (complexs.length < 2) { return elements; }
    for (let complex of complexs) {
      for (let member of complex!.members) {
        const key = generate((member as t.TSPropertySignature).key).code;
        const typeAnnotations: Array<t.TSTypeAnnotation> = typeMap.get(key) ?? [];
        typeMap.set(key, [...typeAnnotations, member.typeAnnotation?.typeAnnotation] as Array<t.TSTypeAnnotation>);
      }
    }

    const updateNode = [];
    for (let [key, value] of typeMap) {

      let uniqueValue = value;
      if (value.length > 1) {
        // 去重
        // TODO: 数组去重
        const unique: Set<string> = new Set([]);
        uniqueValue = value.reduce((types, data: any) => {
          if (data.type === "TSTypeReference") {
            const name = data.typeName.name;
            if (!unique.has(name)) {
              unique.add(name);
              types.push(data);
            }
          } else {
            if (!unique.has(data.type)) {
              unique.add(data.type);
              types.push(data);
            }
          }
          return types;
        }, [] as t.TSTypeAnnotation[]);
      }

      const node = t.tsPropertySignature(
        t.identifier(key),
        t.tsTypeAnnotation(t.tsUnionType(uniqueValue as any as t.TSType[]))
      );

      // 属性是否为可选
      const optional = this.getConfig(CustomConfig.OPTIONAL) as boolean;
      // 如果配置的是false, 那么需要主动判断某个类型是否为可选类型
      const isOptional = value.length !== complexs.length;
      node.optional = optional || isOptional;

      updateNode.push(node);
    }

    // 将对象类型，组合成一个新类型
    return [...basics, t.tsTypeLiteral(updateNode)];
  }

  /** 类型是否可复用 */
  reusableId(code: string): string | undefined {
    if (this.newVarible.size) {
      // 判断是否有可复用的类型
      for (let [id, expression] of this.newVarible.entries()) {
        if (expression === code) {
          return id;
        }
      }
    }
  }

  /** 是否保留注释 */
  retainComments(path: NodePath<any>) {
    // 是否保留注释
    const comments = this.getConfig(CustomConfig.COMMENTS) as string;

    switch (comments) {
      case Icomments.NONE: {
        path.node.leadingComments = null;
        path.node.innerComments = null;
        path.node.trailingComments = null;
        break;
      }
      case Icomments.LEADING_COMMENTS: {
        path.node.innerComments = null;
        path.node.trailingComments = null;
        break;
      }
      case Icomments.INNER_COMMENTS: {
        path.node.leadingComments = null;
        path.node.trailingComments = null;
        break;
      }
      case Icomments.TRAILING_COMMENTS: {
        path.node.leadingComments = null;
        path.node.innerComments = null;
        break;
      }
    }

  }
}
