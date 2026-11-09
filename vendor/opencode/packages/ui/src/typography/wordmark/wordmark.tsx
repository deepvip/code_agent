import { type ComponentProps } from "solid-js"

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g data-slot="wordmark-brand" opacity={props.muted === false ? 1 : 0.6}>
        <text
          x="360"
          y="76"
          text-anchor="middle"
          font-family="Inter, 'Segoe UI', system-ui, sans-serif"
          font-size="64"
          font-weight="600"
          letter-spacing="-2"
          fill={props.outline ? "none" : "currentColor"}
          stroke={props.outline ? "currentColor" : undefined}
          stroke-width={props.outline ? 1 : undefined}
        >全域航空</text>
        <path
          data-slot="wordmark-underline"
          d="M180 98H540"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          pathLength={1}
        />
      </g>
    </svg>
  )
}
