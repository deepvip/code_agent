---
name: java-standards
description: Aero Java 后端编码规范。当编写或修改 Java/Spring 代码、定义接口或数据模型时使用。
---

# Java 后端规范（节选）

## 分层

- Controller 只做参数校验、调用 Service、组装返回，不写业务。
- Service 承载业务与事务边界；事务注解加在 Service 方法上，不加在 Controller。
- Mapper/Repository 只做数据访问，不写业务判断。
- 跨服务调用统一走内部 RPC 客户端，不直接拼 HTTP。

## 命名

| 类型 | 规则 | 示例 |
|---|---|---|
| 类 | 大驼峰，名词 | `OrderCancelService` |
| 方法 | 小驼峰，动词开头 | `cancelOrder` |
| 布尔 | `is/has/can` 开头 | `isPaid` |
| 常量 | 全大写下划线 | `MAX_RETRY_COUNT` |
| DTO | 以 `Request`/`Response`/`DTO` 结尾 | `OrderCreateRequest` |

## 异常

- 业务异常用 `BizException(errorCode, message)`，不要抛 `RuntimeException`。
- 不捕获 `Exception` 后只打日志不处理。
- 对外错误码集中管理，不散落魔法字符串。

## 日志

- 用占位符：`log.info("order cancelled, id={}", id)`，不要字符串拼接。
- 不打全量对象（可能含敏感字段）；必要时用脱敏后的 DTO。
- 异常日志必须带堆栈：`log.error("...", e)`。

## 并发

- 优先用 `ThreadPoolTaskExecutor` 等受管线程池，不 `new Thread()`。
- 共享可变状态必须加锁或用并发容器，并在注释里说明锁的粒度。
- 分布式场景不要用 `synchronized` 当分布式锁。

## 数据库

- 禁止 `SELECT *`；禁止在循环里查库（N+1）。
- 批量写入分批提交，单批不超过 500 条。
- 更新必须带 `WHERE` 主键或唯一索引，禁止全表更新。
