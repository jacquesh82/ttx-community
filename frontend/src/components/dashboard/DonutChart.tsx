import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export interface DonutSlice {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  slices: DonutSlice[]
  centerLabel?: string
  centerSub?: string
  size?: number
  thickness?: number
}

export default function DonutChart({ slices, centerLabel, centerSub, size = 110, thickness = 20 }: DonutChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const r = size / 2
    const innerR = r - thickness
    const g = svg.append('g').attr('transform', `translate(${r},${r})`)

    const total = slices.reduce((s, d) => s + d.value, 0)
    const data = total === 0 ? [{ label: '', value: 1, color: 'var(--surface-card-border)' }] : slices.filter(s => s.value > 0)

    const pie = d3.pie<DonutSlice>().value(d => d.value).sort(null).padAngle(0.02)
    const arc = d3.arc<d3.PieArcDatum<DonutSlice>>().innerRadius(innerR).outerRadius(r - 2)

    g.selectAll('path')
      .data(pie(data))
      .join('path')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('stroke', 'none')

    if (centerLabel) {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', centerSub ? '-0.2em' : '0.35em')
        .attr('font-size', '16')
        .attr('font-weight', '700')
        .attr('fill', 'var(--app-fg)')
        .text(centerLabel)
      if (centerSub) {
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '1.1em')
          .attr('font-size', '9')
          .attr('fill', 'var(--sidebar-muted)')
          .text(centerSub)
      }
    }
  }, [slices, centerLabel, centerSub, size, thickness])

  return <svg ref={svgRef} width={size} height={size} />
}
