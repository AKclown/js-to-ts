import { window, Position, Range } from "vscode";
import * as t from "@babel/types";
import generate from "@babel/generator";
import traverse, { NodePath, Visitor } from "@babel/traverse";
import { ParseResult, parse } from "@babel/parser";
import { BaseClass } from "./BaseClass";
import { AST_TYPES, IGotOptions, IMain } from "./interface/Main.interface";
import { Logger } from "./Logger";
import { ErrorEnum } from "./interface/Logger.interface";
import { CUSTOM_CONFIG, COMMENTS_TYPES, HTTP_STATUS, HTTP_MODE } from "./constant";
import * as iconv from 'iconv-lite';
import { toJsonString } from 'curlconverter';
import got = require('got');
import { MimeUtility } from "./mimeUtility";
import { schemaToTs } from "./schemaToTs";

export class Main extends BaseClass implements IMain {
  private curlRegular = /^curl.*$/gm;

  /** 数组的层级缓存数据 */
  private arrayLevelCache: Map<number, any>;
  /** 新增变量的json缓存数据 */
  private newVariable: Map<string, string>;
  /** 变量名称的缓存 */
  private variableNames: Map<string, number>;
  /** 新增变量Node数据 */
  private variableNode: Map<string, t.ObjectExpression | t.ArrayExpression>;

  public schemaInstance: schemaToTs;

  constructor() {
    super();
    this.newVariable = new Map();
    this.variableNames = new Map();
    this.arrayLevelCache = new Map();
    this.variableNode = new Map();
    this.schemaInstance = new schemaToTs();
  }

  // *********************
  // Add Block Command
  // *********************

  /** 添加注释 */
  addBlockComments() {
    const editor = window.activeTextEditor;
    const data = this.getSelectedInfo();
    const hasSelect = !!data.length;
    if (editor) {
      let cursorPosition: Position = new Position(0, 0);
      const active = editor.selection.active;
      editor.edit((editorContext) => {
        if (!hasSelect) {
          /** 未选中任何内容 */
          cursorPosition = new Position(active.line, active.character + 4);
          editorContext.insert(active, `/**  */`);
          return;
        }

        data.forEach(item => {
          const { range: { start, end } } = item;
          if (start.line === end.line) {
            /** 选中单行 */
            cursorPosition = new Position(end.line, end.character + 4);
            editorContext.replace(item.range, `/** ${item.text} */`);
          } else {
            /** 选中多行 */

            // 默认从该行第一个文本开始选择
            const newStart = new Position(start.line, 0);
            const newEnd = new Position(end.line + 1, 0);
            const text = this.getActiveTextByStartEnd(newStart, newEnd).slice(0, -1);
            // 取出最小空格
            const minSpaceNum = text.split(/\n/g).reduce((prev, cur) => Math.min(cur.length - cur.trimStart().length, prev), Number.MAX_SAFE_INTEGER);
            const spaceStr = ' '.repeat(minSpaceNum);
            // 将第二行开始的所有空格删掉minSpaceNum个，然后删掉第一行的minSpaceNum个空格
            const replaceText = text.replace(/\n\s*/g, v => `${spaceStr} * ${v.slice(minSpaceNum || 1)}`).slice(minSpaceNum - 1 >= 0 ? minSpaceNum - 1 : 0);
            // todo: 需要获取最后一个字符
            const range = new Range(newStart, newEnd);
            editorContext.insert(newEnd, '\n');
            editorContext.replace(range, `${spaceStr}/**\n ${spaceStr}* ${replaceText}\n${spaceStr} */`);

            cursorPosition = new Position(newEnd.line + 1, minSpaceNum);
          }
        });
      });
      this.setCursorPosition(cursorPosition.line, cursorPosition.character);
    }
  }

  // *********************
  // schema To TS
  // *********************
  schemaToTs() {
    this.schemaInstance.schemaToTs();
  }

  // *********************
  // API TO TS
  // *********************

  apiToTs(isSchema: boolean, code: string, specificPath?: string) {
    try {
      // 是否打开临时文件展示内容
      const openTemporaryFile = this.getConfig(
        CUSTOM_CONFIG.OPEN_TEMPORARY_FILE
      ) as boolean;

      let tsCode = '';
      if (isSchema) {
        tsCode = this.schemaInstance.parseSchemaCode(code, specificPath);
      } else {
        tsCode = this.parseCode(code);
      }
      openTemporaryFile && this.openTemporaryFile(tsCode);
      return { value: tsCode, status: HTTP_STATUS.SUCCEED };
    } catch (error: any) {
      Logger.error({
        type: ErrorEnum.UNKNOWN_MISTAKE,
        data: error.message,
        items: ["issue"],
      });
      return { value: error.message, status: HTTP_STATUS.FAILED };
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
            CUSTOM_CONFIG.OPEN_TEMPORARY_FILE
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
        items: ["issue"],
      });
    }
  }

  // *********************
  // Parse
  // *********************

  parseCode(text: string): string {
    this.newVariable.clear();
    this.variableNames.clear();
    this.variableNode.clear();
    const regular = /(var|let|const)\s*(\w+)(.*)/m;
    let updateText = text;
    let variableName = updateText.match(regular)?.[2];
    // 判断是否存在变量
    if (!variableName) {
      // 不能存在分号
      variableName = 'RootObject';
      updateText = `const ${variableName} = ${updateText}`
        .trimRight()
        .replace(/;$/, "");
    } else {
      // 首字母大写
      updateText = updateText.replace(regular, (match, $1, name, rest) => {
        variableName = this.getID(name);
        return `${$1} ${variableName} ${rest}`;
      });
    }

    const ast: ParseResult<t.File> = parse(updateText, {
      plugins: ["typescript"],
    });

    this.traverseCode(ast, variableName);
    const code = generate(ast).code;
    return code;
  }

  // *********************
  // Traverse
  // *********************

  // TODO: 暂未优化 (后续单独成拆成一个npm包 - 二进制包)
  traverseCode(ast: ParseResult<t.File>, parentName: string) {
    const declaration = (ast.program.body[0] as t.VariableDeclaration)
      .declarations[0];
    const type = declaration!.init!.type;
    /**
     * 1. 数组之间的层级不共享、即数组类型合并不会与另一个数组
     * 2. 对象的层级遇到数组时，不再进行层级累加(数组由1进行操作)
     */
    if (type === AST_TYPES.OBJECT_EXPRESSION) {
      traverse(ast, this.ObjectVisitor, undefined, { parentName, arrayLevel: 0 });
    } else if (type === AST_TYPES.ARRAY_EXPRESSION) {
      traverse(ast, this.ArrayVisitor, undefined, { parentName, arrayLevel: 0 });
    }
    traverse(ast, this.ProgramVisitor);
    traverse(ast, this.VariableVisitor);
  }

  // *********************
  // Visitor
  // *********************

  /** 对象Visitor */
  get ObjectVisitor(): Visitor<t.Node> {
    const _that = this;
    const prefix = this.getConfig(CUSTOM_CONFIG.PREFIX) as string ?? '';
    return {
      ObjectProperty(path: NodePath<t.ObjectProperty>, state: any = {}) {
        const value = path.node.value;
        let key = path.node.key;
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
            const id = _that.getID(key);

            // 元素类型只存在基础类型，不生成新的interface定义
            const complexTypes = value.elements.some(
              (element) => !(t.isLiteral(element) || t.isIdentifier(element) || t.isUnaryExpression(element))
            );
            if (complexTypes) {
              // $判断当前层级是否为0，为0时清空旧数据，表示换了一个数组
              state.arrayLevel++;
              const hasCache = _that.arrayLevelCache.has(state.arrayLevel);
              const levelCacheData = _that.arrayLevelCache.get(state.arrayLevel);

              const originParentName = state.parentName;
              state.parentName = levelCacheData?.id ?? id;
              path.get("value").traverse(_that.ArrayVisitor, state);
              state.parentName = originParentName;

              let elements = (path.node.value as t.ArrayExpression).elements;
              let updateElements: t.ArrayExpression['elements'] = [];
              // $ 判断是否存在同一层级的对象数据,存在进行合并
              if (hasCache) {
                // 存在数据，数据进行合并
                const cacheElements = levelCacheData.value.elements;
                // $ 类型去重
                updateElements = _that.typeIntegration([...cacheElements, ...elements]) as t.ArrayExpression['elements'];
              } else {
                // 不存在数据，保留原本的
                updateElements = _that.typeIntegration(elements) as t.ArrayExpression['elements'];
              }
              (path.node.value as t.ArrayExpression).elements = updateElements;
              _that.arrayLevelCache.set(state.arrayLevel, { id: levelCacheData?.id ?? id, value: path.node.value });

              state.arrayLevel--;
              if (!state.arrayLevel) {
                for (let { id, value } of _that.arrayLevelCache.values()) {
                  // 新增变量
                  _that.variableNode.set(id, value as t.ArrayExpression);
                }
                _that.arrayLevelCache.clear();
              }

              typeAnnotation = t.tsTypeReference(
                t.identifier(`Array<${prefix}${levelCacheData?.id ?? id}>`)
              );
            } else {
              // 基础类型
              path.get("value").traverse(_that.ArrayVisitor, state);

              // 类型去重
              let elements = (path.node.value as t.ArrayExpression).elements;
              (path.node.value as t.ArrayExpression).elements = _that.typeIntegration(elements) as t.ArrayExpression['elements'];

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
          const id = _that.getID(key);
          const originParentName = state.parentName;
          state.parentName = id;
          path.get("value").traverse(_that.ObjectVisitor, state);
          state.parentName = originParentName;

          // 自动检测对象Maps
          const value = _that.detectMaps(path.node.value as t.ObjectExpression);
          path.node.value = value;

          const variableExpression = generate(path.node.value).code;
          const isBlank = variableExpression === '{}';
          const reusableId = _that.reusableById(id, variableExpression);

          if (!reusableId && !isBlank) {
            // 生成一个新的变量
            _that.variableNode.set(id, path.node.value as t.ObjectExpression);
          }

          const prototypeName = isBlank ? 'Record<string, unknown>' : `${prefix}${reusableId ?? id}`;
          typeAnnotation = t.tsTypeReference(t.identifier(prototypeName));

          path.skip();
        }

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
          key as t.Expression,
          t.tsTypeAnnotation(typeAnnotation)
        );

        // 属性是否为可选
        const optional = _that.getConfig(CUSTOM_CONFIG.OPTIONAL) as boolean;
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
    return {
      ObjectExpression(path: NodePath<t.ObjectExpression>, state: any = {}) {
        path.traverse(_that.ObjectVisitor, state);

        // 自动检测对象Maps
        const value = _that.detectMaps(path.node);
        path.node = value;

        path.replaceWith(
          t.tsTypeLiteral(
            path.node.properties as unknown as t.TSTypeElement[]
          )
        );
        path.skip();

      },
      ArrayExpression(path: NodePath<t.ArrayExpression>, state: any = {}) {
        // 判断最外层是否为数组
        if (path.parent.type !== "VariableDeclarator") {
          if (path.node.elements.length) {
            path.traverse(_that.ArrayVisitor, state);
            // 类型去重
            let elements = (path.node as t.ArrayExpression).elements;
            (path.node as t.ArrayExpression).elements = _that.typeIntegration(elements) as t.ArrayExpression['elements'];

            path.replaceWith(
              t.tsArrayType(
                t.tsUnionType(path.node.elements as unknown as t.TSType[])
              )
            );
          } else {
            path.replaceWith(t.tsArrayType(t.tsUnknownKeyword()));
          }
        } else {
          // 最外层为数组
          if (path.node.elements.length) {
            state.arrayLevel++;
            path.traverse(_that.ArrayVisitor, state);
            // 类型去重
            let elements = (path.node as t.ArrayExpression).elements;
            // $ 数据同层对比合并，可选择等
            const hasCache = _that.arrayLevelCache.has(state.arrayLevel);
            const levelCacheData = _that.arrayLevelCache.get(state.arrayLevel);
            let updateElements: t.ArrayExpression['elements'] = [];
            if (hasCache) {
              // 存在数据，数据进行合并
              const cacheElements = levelCacheData.value.elements;
              // $ 类型去重
              updateElements = _that.typeIntegration([...cacheElements, ...elements]) as t.ArrayExpression['elements'];
            } else {
              // 不存在数据，保留原本的
              updateElements = _that.typeIntegration(elements) as t.ArrayExpression['elements'];
            }
            (path.node as t.ArrayExpression).elements = updateElements;

            //  判断合并之后的数组对象是否跟父类型一致，一致则不在产生新数据
            state.arrayLevel--;
            if (!state.arrayLevel) {
              for (let { id, value } of _that.arrayLevelCache.values()) {
                // 新增变量
                _that.variableNode.set(id, value as t.ArrayExpression);
              }
              _that.arrayLevelCache.clear();
            }

          }
        }
        path.skip();
      },
      "StringLiteral|TemplateLiteral"(
        path: NodePath<t.Literal>,
      ) {
        path.replaceWith(t.tsStringKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      "NumericLiteral|BigIntLiteral|DecimalLiteral"(
        path: NodePath<t.Literal>,
      ) {
        path.replaceWith(t.tsNumberKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      UnaryExpression(
        path: NodePath<t.UnaryExpression>,
      ) {
        // TODO: UnaryExpression未穷举完所有情况
        path.replaceWith(t.tsNumberKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      BooleanLiteral(path: NodePath<t.BooleanLiteral>) {
        path.replaceWith(t.tsBooleanKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      NullLiteral(path: NodePath<t.NullLiteral>) {
        path.replaceWith(t.tsNullKeyword());
        // 是否保留注释
        _that.retainComments(path);
      },
      Identifier(path: NodePath<t.Identifier>) {
        if (path.parent.type !== "VariableDeclarator") {
          if (path.node.name === "undefined") {
            path.replaceWith(t.tsUndefinedKeyword());
          } else {
            path.replaceWith(t.tsUnknownKeyword());
          }
          // 是否保留注释
          _that.retainComments(path);
        }
      },
    };
  }

  /** 数据是否可自己引用自己 */
  get ProgramVisitor(): any {
    const _that = this;
    return {
      Program(path: NodePath<t.Program>, state: any = {}) {
        // 添加新增的类型定义
        const variables = [];
        for (let [key, node] of _that.variableNode.entries()) {
          const variable = t.variableDeclaration("const", [
            t.variableDeclarator(
              t.identifier(key),
              node
            ),
          ]);
          variables.push(variable);
        }
        if (variables.length) {
          path.node.body.splice(1, 0, ...variables);
        }
        // 判断是否自己引用自己
        try {
          const body = path.node.body as t.VariableDeclaration[];
          _that.selfReference(body, body[0], null);
        } catch (error) {
          console.error('error: ', error);
          // $ 如果判断是否可自调用报错，则不影响原有逻辑
        }
      }
    };
  }

  /** 变量处理 */
  get VariableVisitor(): Visitor<t.Node> {
    const _that = this;
    const prefix = this.getConfig(CUSTOM_CONFIG.PREFIX) as string ?? '';
    return {
      VariableDeclaration(path: NodePath<t.VariableDeclaration>) {
        // 是否追加export
        const exportType = _that.getConfig(CUSTOM_CONFIG.EXPORT_TYPE) as boolean;

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

              // TODO: 判断存在问题
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

  /** 从剪切板更新内容 */
  async updateCodeByClipboard() {
    // 从粘贴板获取内容
    const code = await this.getCodeByClipboard();
    if (this.curlRegular.test(code)) {
      const result = await this.getCodeByGot(HTTP_MODE.CURL, { url: code });
      if (result.status === HTTP_STATUS.SUCCEED) {
        const updateCode = this.parseCode(result.code!);
        this.openTemporaryFile(updateCode);
      }
    } else {
      const updateCode = this.parseCode(code);
      this.openTemporaryFile(updateCode);
    }

  }

  /** 数组对象类型整合 */
  // TODO： 类型未定义
  typeIntegration(elements: Array<any>): Array<any> {
    // 对象数据数据整合在一起成为联合类型
    const typeMap: Map<string, { optional: boolean, type: Array<any> }> = new Map([]);
    // 基础类型
    const basics: Array<any> = [];
    // 复杂类型
    const complexes: Array<any> = [];
    elements.forEach(element => {
      if (t.isTSTypeLiteral(element)) {
        complexes.push(element);
      } else {
        basics.push(element);
      }
    });
    if (complexes.length < 2) { return this.deduplication(elements); }

    for (let complex of complexes) {
      for (let member of complex!.members) {
        const key = generate((member as t.TSPropertySignature).key).code;
        // 某个属性存在optional为true时，后续就不能把option改为false了
        const optional: boolean = typeMap.get(key)?.optional || member.optional;
        const typeAnnotations: Array<t.TSTypeAnnotation> = typeMap.get(key)?.type ?? [];

        typeMap.set(key, { optional, type: [...typeAnnotations, member.typeAnnotation?.typeAnnotation] as Array<t.TSTypeAnnotation> });
      }
    }

    const updateNode = [];
    if (typeMap.size) {
      for (let [key, value] of typeMap) {
        // $ 对类型进行字符排序，例如string | number 与 number | string应该是等价的
        let sortType = value.type.sort((a, b) => a.type.localeCompare(b.type));
        let uniqueValue = this.deduplication(sortType);
        if (uniqueValue.length > 1) {
          // $ 类型为TSTypeReference时，判断类型之间是否可以合并在一起。
          // TODO: 例如: count1 | count2 | count3, count1已经包含了count2 | count3，应该舍弃count2 | count3 只保留count1
          // 移除掉variableNode和newVariable里面的数据
          const typeNames = uniqueValue.filter(item => t.isTSTypeReference(item)).map(item => ((item as unknown as t.TSTypeReference)!.typeName as t.Identifier)!.name);
          const subsetNames = typeNames.filter(name => this.isSubset(name));
          uniqueValue = uniqueValue.filter(item => {
            if (t.isTSTypeReference(item)) {
              const name = ((item as unknown as t.TSTypeReference)!.typeName as t.Identifier)!.name;
              return !subsetNames.includes(name);
            }
            return true;
          });
        }

        // 存在两个及以上类型，需要将undefined改为?:，不是显示声明undefined
        let excludeUndefined = uniqueValue.length > 1 ? (uniqueValue as t.TSTypeAnnotation[]).filter((unique: any) => unique.type !== 'TSUndefinedKeyword') : uniqueValue;

        let isUnion = !!(excludeUndefined.length > 1);
        const node = t.tsPropertySignature(
          t.identifier(key),
          t.tsTypeAnnotation(isUnion ? t.tsUnionType(excludeUndefined as any as t.TSType[]) : excludeUndefined[0] as any as t.TSType)
        );

        // 属性是否为可选
        const optional = this.getConfig(CUSTOM_CONFIG.OPTIONAL) as boolean;
        // 如果配置的是false, 那么需要主动判断某个类型是否为可选类型
        const isOptional = value.optional
          || excludeUndefined.length !== uniqueValue.length  // 联合类型中存在undefined
          || value.type.length !== complexes.length;
        node.optional = optional || isOptional;

        updateNode.push(node);
      }
    }

    // 将对象类型，组合成一个新类型
    return [...this.deduplication(basics), t.tsTypeLiteral(updateNode)];
  }

  /** 是否为某个对象的子集 */
  isSubset(name: string) {
    const variableNode = this.variableNode as Map<string, t.ObjectExpression>;
    const target = variableNode.get(name)!;
    for (let [key, source] of variableNode.entries()) {
      if (name !== key && target.properties.length < source.properties.length) {
        // 判断当前对象是否被其他对象包含，联合类型
        const targetCode = this.jsonToObject(generate(target).code);
        const sourceCode = this.jsonToObject(generate(source).code);
        const isContain = this.areObjectsContain(targetCode, sourceCode);
        if (isContain) {
          // 移除掉该变量的缓存
          this.variableNode.delete(name);
          this.newVariable.delete(name);
          return true;
        }
      }
    }
  }

  /** 对象是否包裹 */
  areObjectsContain(target: Record<string, any>, source: Record<string, any>) {
    const targetEntries = Object.entries(target);
    for (const [key, value] of targetEntries) {
      if (!source.hasOwnProperty(key) || source[key] !== value) {
        return false;
      }
    }
    return true;
  }



  /** 类型是否可复用 */
  reusableById(originId: string, code: string): string | undefined {
    // TODO:对比 - 策略可优化
    if (this.newVariable.size) {
      // 判断是否有可复用的类型
      for (let [id, expression] of this.newVariable.entries()) {
        if (expression === code) {
          return id;
        }
      }
    }
    this.newVariable.set(originId, code);
  }

  /** 去重 */
  deduplication(value: Array<t.Expression | t.SpreadElement | null>): Array<any> {
    if (value.length > 1) {
      const unique: Set<string> = new Set([]);
      // TODO： 已經存在數組，應該整合在一起，並且去掉unknown
      const uniqueValue = value.reduce((types, data: any) => {
        if (data.type === "TSTypeReference") {
          const name = data.typeName.name;
          if (!unique.has(name)) {
            unique.add(name);
            types.push(data);
          }
        } else if (data.type === "TSUnionType") {
          const unionTypes = data.types;
          unionTypes.forEach((unionType: any) => {
            if (unionType.type === "TSTypeReference") {
              const name = unionType.typeName.name;
              if (!unique.has(name)) {
                unique.add(name);
                types.push(data);
              }
            } else {
              if (!unique.has(unionType.type)) {
                unique.add(unionType.type);
                types.push(unionType);
              }
            }
          });
        } else {
          if (!unique.has(data.type)) {
            unique.add(data.type);
            types.push(data);
          }
        }
        return types;
      }, [] as t.TSTypeAnnotation[]);
      return uniqueValue;
    }
    return value;
  }

  /** 获取到id */
  getID(key: t.PrivateName | t.Expression | string) {
    let id = (key as t.Identifier)?.name ?? (key as t.StringLiteral)?.value ?? key;
    id = `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
    let updateId = this.toCamelCase(id);
    if (this.variableNames.has(id)) {
      const index = (this.variableNames.get(id) ?? 0) + 1;
      updateId = `${id}${index}`;
      this.variableNames.set(id, index);
    } else {
      this.variableNames.set(id, 0);
    }
    return updateId;
  }

  /** 是否保留注释 */
  retainComments(path: NodePath<any>) {
    // 是否保留注释
    const comments = this.getConfig(CUSTOM_CONFIG.COMMENTS) as string;

    switch (comments) {
      case COMMENTS_TYPES.NONE: {
        path.node.leadingComments = null;
        path.node.innerComments = null;
        path.node.trailingComments = null;
        break;
      }
      case COMMENTS_TYPES.LEADING_COMMENTS: {
        path.node.innerComments = null;
        path.node.trailingComments = null;
        break;
      }
      case COMMENTS_TYPES.INNER_COMMENTS: {
        path.node.leadingComments = null;
        path.node.trailingComments = null;
        break;
      }
      case COMMENTS_TYPES.TRAILING_COMMENTS: {
        path.node.leadingComments = null;
        path.node.innerComments = null;
        break;
      }
    }
  }

  /** 字符串转驼峰 */
  toCamelCase(name: string) {
    return name.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
  }

  /** 判断自引用数据 - 深度遍历 */
  selfReference(body: t.VariableDeclaration[], prev: t.VariableDeclaration, next: t.VariableDeclaration | null) {
    // TODO 联合类型复杂类型
    const strictMode = this.getConfig(CUSTOM_CONFIG.STRICT_MODE) as boolean;
    const prefix = this.getConfig(CUSTOM_CONFIG.PREFIX) as string ?? '';

    const prevDeclaration = prev.declarations[0];
    const prevInit = prevDeclaration.init;
    let prevProps = t.isObjectExpression(prevInit) ? prevInit.properties : ((prevInit as t.ArrayExpression)?.elements[0] as unknown as t.TSTypeLiteral)?.members;

    if (next) {
      const nextDeclaration = next.declarations[0];
      const nextInit = nextDeclaration.init;
      const prevId = (prevDeclaration.id as t.Identifier).name;
      const nextId = (nextDeclaration.id as t.Identifier).name;
      let nextProps = t.isObjectExpression(nextInit) ? nextInit.properties : ((nextInit as t.ArrayExpression)?.elements[0] as unknown as t.TSTypeLiteral)?.members;
      if (nextProps) {
        this.traverseProps(body, next, nextProps);
      } else {
        // 数组中存在基础类型
        const elements = (nextInit as t.ArrayExpression).elements;
        const tsTypeLiterals = elements.filter((props) => t.isTSTypeLiteral(props));
        for (let tsTypeLiteral of tsTypeLiterals) {
          const members = (tsTypeLiteral as unknown as t.TSTypeLiteral).members;
          this.traverseProps(body, next, members);
        }
      }

      // !!! 严格模式 (需要完全一致类型 - 不做任何兼容处理)
      if (strictMode) {
        // $ 判断父子类型是否一致,一致修改父元素类型
        const prevCode = generate(prevInit as t.Expression).code.replace(/(^\[|\]$|\,)/g, '');
        let nextCode = generate(nextInit as t.Expression).code;
        // 对象
        nextCode = nextCode.replace(/Record\<string, unknown\>;/, `${prefix}${nextId};`);
        // 数组
        nextCode = nextCode.replace(/Array\<unknown\>;/, `Array<${prefix}${nextId}>;`).replace(/(^\[|\]$|\,)/g, '');

        if (nextCode === prevCode) {
          // 完全相同，修改父节点的值为引用自身
          for (const props of prevProps) {
            const parentType = (props as t.TSTypeElement).typeAnnotation!.typeAnnotation;
            if (t.isTSTypeReference(parentType)) {
              const name = (parentType.typeName as t.Identifier).name;
              if (name === `Array<${prefix}${nextId}>`) {
                (parentType.typeName as t.Identifier).name = `Array<${prefix}${prevId}>`;
              } else if (name === `${prefix}${nextId}`) {
                (parentType.typeName as t.Identifier).name = `${prefix}${prevId}`;
              }
            }
          }
          return true;
        }
      } else {
        // TODO: 非严格模式 => 兼容处理
      }
    } else {
      if (prevProps) {
        this.traverseProps(body, prev, prevProps);
      } else {
        // 数组中存在基础类型
        const elements = (prevInit as t.ArrayExpression).elements;
        const tsTypeLiterals = elements.filter((props) => t.isTSTypeLiteral(props));
        for (let tsTypeLiteral of tsTypeLiterals) {
          const members = (tsTypeLiteral as unknown as t.TSTypeLiteral).members;
          this.traverseProps(body, prev, members);
        }
      }
    }
  }

  /** 变量属性 */
  traverseProps(body: t.VariableDeclaration[], prev: t.VariableDeclaration, prevProps: any) {
    const prefix = this.getConfig(CUSTOM_CONFIG.PREFIX) as string ?? '';
    // 判断next是否存在非基础类型
    for (let props of prevProps) {
      const type = props.typeAnnotation.typeAnnotation;
      if (t.isTSTypeReference(type)) {
        // 数组值需要变量名称，并且去掉prefix前缀
        let name = (type.typeName as t.Identifier).name;
        const reg = new RegExp("^Array<(" + prefix + ".*)>");
        name = name.replace(reg, (match, p1) => p1).replace(new RegExp(prefix), '');
        // 如果是Record<string, unknown>或者unknown表示最后一个了
        if (!['Record<string, unknown>', 'unknown'].includes(name)) {
          // 找到对应的变量声明
          for (let [index, value] of body.entries()) {
            const declaration = value.declarations[0];
            if ((declaration.id as t.Identifier).name === name) {
              let isConsistent = this.selfReference(body, prev, value);
              if (isConsistent) {
                // 父子一致，删除当前变量声明
                body.splice(index, 1);
              }
              break;
            }
          }
        }
      }
    }
  }

  /** 判断属性的类型是否完全相同 */
  detectMaps(values: t.ObjectExpression): t.ObjectExpression {
    /**
     * 自动检测Maps https://github.com/MariusAlch/vscode-json-to-ts/issues/14
     * 需要满足如下条件：
     * properties数量至少2个，且类型不是基础类型、所有属性的类型完全相同
     */
    const properties = values.properties || [];
    let updateProps = properties as any as Array<t.TSPropertySignature>;
    if (updateProps.length > 1) {
      const [firstProps, ...restProps] = updateProps;
      const firstTypeAnnotation = firstProps?.typeAnnotation?.typeAnnotation;
      // 判断所有属性的类型是否一致
      const isSame = restProps.every(props => {
        const typeAnnotation = props?.typeAnnotation?.typeAnnotation;
        return typeAnnotation
          && t.isTSTypeReference(typeAnnotation)
          && t.isTSTypeReference(firstTypeAnnotation)
          && (typeAnnotation.typeName as t.Identifier).name === (firstTypeAnnotation.typeName as t.Identifier).name;
      });

      // 相同只保留一个props，并且将key改为[string]
      if (isSame) {
        const [firstProps, ...restProps] = updateProps;
        (firstProps.key as t.Identifier).name = '[key:string]';
        updateProps = [firstProps];
      }
    }
    values.properties = updateProps as any as Array<t.ObjectProperty>;
    return values;
  }

  // *********************
  // Got Request
  // *********************

  async getCodeByGot(mode: HTTP_MODE, options: IGotOptions) {
    try {
      const timeout = this.getConfig(CUSTOM_CONFIG.TIMEOUT) as number ?? 6000;
      let gotUrl = options.url;
      let gotOptions = options.options ?? {};
      if (mode === HTTP_MODE.CURL) {
        const curlHttp = toJsonString(gotUrl);
        const { url, ...reset } = JSON.parse(curlHttp);
        gotUrl = url;
        gotOptions = reset;
      }

      const response: any = await got(gotUrl, { ...gotOptions, timeout } as got.GotOptions<string>);
      const contentType = response.headers['content-type'];
      let encoding: string = 'utf-8';
      if (contentType) {
        encoding = MimeUtility.parse(contentType).charset ?? encoding;
      }

      const bodyBuffer = response.body as Buffer;
      const bodyString = bodyBuffer && iconv.encodingExists(encoding) ?
        typeof bodyBuffer === 'string' ? bodyBuffer :
          iconv.decode(bodyBuffer, encoding) : bodyBuffer.toString();
      return { code: bodyString, status: HTTP_STATUS.SUCCEED };
    } catch (error: any) {
      return { message: error.message, status: HTTP_STATUS.FAILED };
    }
  }
}