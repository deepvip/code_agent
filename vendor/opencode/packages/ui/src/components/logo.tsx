import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-mark-a" d="M8 2.5 13.5 18" stroke="var(--icon-strong-base)" stroke-width="2.4" stroke-linecap="round" fill="none" />
      <path data-slot="logo-mark-a" d="M8 2.5 2.5 18" stroke="var(--icon-strong-base)" stroke-width="2.4" stroke-linecap="round" fill="none" />
      <path data-slot="logo-mark-a" d="M5 12.5H11" stroke="var(--icon-strong-base)" stroke-width="2.4" stroke-linecap="round" fill="none" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 400 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        data-slot="logo-splash-text"
        x="200"
        y="50"
        text-anchor="middle"
        dominant-baseline="central"
        fill="var(--icon-strong-base)"
        font-size="70"              // 1. 调整字号（原来是 80，如果字多可以稍微改小防止溢出）
        font-weight="600"           // 2. 调整字重（如 400 正常，600 半粗，700 加粗，800 极粗）
        font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" // 3. 指定字体族
        style="letter-spacing: 4px;" // 4. 其他 CSS 样式（如字间距）
      >
        全域航空
      </text>
    </svg>
  )
}


export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g data-slot="logo-wordmark">
        <text x="117" y="31" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="36" font-weight="600" letter-spacing="-1" fill="var(--icon-base)">Aero Code</text>
      </g>
    </svg>
  )
}
