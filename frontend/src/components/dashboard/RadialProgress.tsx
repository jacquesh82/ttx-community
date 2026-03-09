import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface RadialProgressProps {
  pct: number       // 0-100
  size?: number
  thickness?: number
  color?: string
  label?: string
  sublabel?: string
}

export default function RadialProgress({ pct, size = 90, thickness = 10, color = '#3b82f6', label, sublabel }: RadialProgressProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const r = size / 2
    const innerR = r - thickness
    const g = svg.append('g').attr('transform', `translate(${r},${r})`)

    const bgArc = d3.arc()({
      innerRadius: innerR, outerRadius: r - 2,
      startAngle: 0, endAngle: Math.PI * 2,
    } as d3.DefaultArcObject)
    g.append('path').attr('d', bgArc!).attr('fill', 'var(--surface-card-border)')

    const fillArc = d3.arc()({
      innerRadius: innerR, outerRadius: r - 2,
      startAngle: 0, endAngle: Math.PI * 2 * (pct / 100),
    } as d3.DefaultArcObject)
    g.append('path').attr('d', fillArc!).attr('fill', color)

    if (label) {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', sublabel ? '-0.2em' : '0.35em')
        .attr('font-size', size < 80 ? '12' : '14')
        .attr('font-weight', '700')
        .attr('fill', 'var(--app-fg)')
        .text(label)
      if (sublabel) {
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '1.1em')
          .attr('font-size', '8')
          .attr('fill', 'var(--sidebar-muted)')
          .text(sublabel)
      }
    }
  }, [pct, size, thickness, color, label, sublabel])

  return <svg ref={svgRef} width={size} height={size} />
}
