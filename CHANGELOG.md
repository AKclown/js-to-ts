### 0.6.0 (2023-07-17)
1. 支持`curl`方式请求。 
`chrome -> network -> copy -> Copy as cURL(bash)`

### 0.5.1 (2023-07-14)

1. 类型`{a: string | undefined }`改为`{a?: string }`
2. 对类型进行字符排序，例如`string | number` 与 `number | string`应该是等价的

### 0.5.0 (2023-06-28)

1. 添加[Automatically detect maps](https://github.com/MariusAlch/vscode-json-to-ts/issues/14)

```ts
 {
  "should_be_ts_map_not_an_interface": {
    "key1": {
      "a": 1,
        "b": 2
    },
    "key2": {
      "a": 3,
      "b": 4
    },
  }
}
// 生成[key:string]: IKey1。 而不是key1:Ikey1、key2：Ikey2 (会进行自动检测)
export interface IRootObject {
    should_be_ts_map_not_an_interface: IShouldBeTsMapNotAnInterface;
}
export interface IShouldBeTsMapNotAnInterface {
  [key:string]: IKey1;
}
export interface IKey1 {
  a: number;
  b: number;
}
```

2. 优化自己引用自己代码逻辑

### 0.4.10 (2023-06-25)

1. 变量名称首字母大写
2. 数组对象合并可选判断
3. 英文的 placeholder 显示不全
4. 自己引用自己以及配置面板 (目前支持严格模式)
5. 配置面板`严格模式`(类型完全一致才会被认为自己引用自己) | `非严格模式`(类型会做一些兼容处理)

### 0.4.9 (2023-06-06)

1. 数组内多个对象`类型`按层级合并
2. 暂时去掉自己调用自己(后续会追加)

### 0.4.8 (2023-06-02)

1. 名称不随机生成
2. 完善块级注释

### 0.4.7 (2023-06-01)

1. 修复自己调用问题
2. 生成的类型顺序

### 0.4.6 (2023-05-31)

1. 修复数组多个对象报错

### 0.4.5 (2023-05-31)

1. 支持`UnaryExpression`
2. 类型复用以及类型去重

### 0.4.4 (2023-05-28)

1. 添加自定义配置`comments`和`prefix`

### 0.4.3 (2023-05-28)

1. 添加自定义配置`optional`

### 0.4.2 (2023-05-27)

1. 添加配置`openTemporaryFile`和`exportType`
2. 未选择内容时按`ctrl+shift+j`会转换剪切板内容
3. 新增在右侧打开临时文件来展示类型声明

### 0.4.0 (2023-05-26)

1. 使用`@babel/traverse`重构 AST 遍历逻辑
2. 将复杂类型拆分出一个新的 interface 定义
3. 添加日志逻辑，方便用户上报 issue
4. 支持字面量正则

### 0.3.7 (2023-05-19)

1. 修复支持中文国际化

### 0.3.6 (2023-05-19)

1. 支持中英文

### 0.3.5 (2023-05-11)

1. 支持接口名称子节点复用

### 0.3.4 (2023-04-28)

1. 修复插件所有功能异常问题

### 0.3.2 (2023-04-24)

1. 添加块级注释行/\*\* \*/; (快捷键: ctrl+')

### 0.3.1 (2023-04-09)

- 解决资源无法加载
- 解决 eval 无法通过 csp 问题
- 修改样式让其符合暗黑样式
- 更新 changelog 和 README

### 0.3.0 (2023-04-09)

- api to ts 功能

### 0.2.4 (2023-04-08)

- 更新 LOGO 图

### 0.2.3 (2023-04-08)

- 使用 AST 数据结构重构
- 支持保留原有的注释

### 0.2.2 (2023-04-06)

- 支持数组一键转换
- 将类型设置为可选类型

### 0.2.1 (2023-02-20)

- 修复存在变量判断错误问题

### 0.2.0 (2023-02-18)

- 新增 JS 对象转为 ts 对象

### 0.1.3 (2021-21-17)

**Bug Fixes**

- 修改 template.png 和 tutorials.gif
- 新增 CHANGELOG 文件(版本更新记录)

### 0.1.2 (2021-21-17)

**Bug Fixes**

- 修复 ApiResponse«List«PlayerAwardVo»» 多个«无法匹配问题
- 新增英文版本 README.md

### 0.1.1 (2021-21-15)

**Bug Fixes**

- 将:必选改为?:可选

### 0.1.0 (2021-21-15)

**Feature**

- swagger 类型转换为 typescript 类型
- 添加 ctrl+shift+k 快捷键
