export interface GraphSize { width: number; height: number }
export interface GraphPoint { x: number; y: number }
export interface GraphTransform extends GraphPoint { scale: number }
export const GRAPH_INSET = 16
export const MAX_GRAPH_SCALE = 2

export function fitGraph(content: GraphSize, viewport: GraphSize): GraphTransform {
  const scale = Math.min(1, Math.max(1, viewport.width - GRAPH_INSET * 2) / content.width,
    Math.max(1, viewport.height - GRAPH_INSET * 2) / content.height)
  return { scale, x: (viewport.width - content.width * scale) / 2, y: (viewport.height - content.height * scale) / 2 }
}

export function constrainGraph(view: GraphTransform, content: GraphSize, viewport: GraphSize): GraphTransform {
  const axis = (offset: number, length: number, space: number) => length <= space - GRAPH_INSET * 2
    ? (space - length) / 2
    : Math.min(GRAPH_INSET, Math.max(space - length - GRAPH_INSET, offset))
  return { scale: view.scale, x: axis(view.x, content.width * view.scale, viewport.width), y: axis(view.y, content.height * view.scale, viewport.height) }
}

// Preserve the graph point under the fingers as their midpoint moves and distance changes.
export function zoomGraph(view: GraphTransform, scale: number, anchor: GraphPoint, destination = anchor): GraphTransform {
  return { scale, x: destination.x - (anchor.x - view.x) * scale / view.scale,
    y: destination.y - (anchor.y - view.y) * scale / view.scale }
}
