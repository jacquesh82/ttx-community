import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface GaugeChartProps {
  value: number // 0-100
  size?: number
}

export default function GaugeChart({ value, size = 160 }: GaugeChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const w = size
    const h = size * 0.6
    const cx = w / 2
    const cy = h * 0.92
    const outerR = w * 0.44
    const innerR = outerR - 14
    const startAngle = -Math.PI * 0.85
    const endAngle = Math.PI * 0.85

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`)

    // Background arc
    const bgArc = d3.arc()({ innerRadius: innerR, outerRadius: outerR, startAngle, endAngle } as d3.DefaultArcObject)
    g.append('path').attr('d', bgArc!).attr('fill', 'var(--surface-card-border)')

    // Color stops: red → amber → green
    const colorScale = d3.scaleLinear<string>()
      .domain([0, 50, 100])
      .range(['#ef4444', '#f59e0b', '#22c55e'])

    const fillAngle = startAngle + (endAngle - startAngle) * (value / 100)
    if (value > 0) {
      const fillArc = d3.arc()({ innerRadius: innerR, outerRadius: outerR, startAngle, endAngle: fillAngle } as d3.DefaultArcObject)
      g.append('path').attr('d', fillArc!).attr('fill', colorScale(value))
    }

    // Needle
    const needleAngle = startAngle + (endAngle - startAngle) * (value / 100)
    const needleLen = outerR - 6
    const nx = Math.cos(needleAngle - Math.PI / 2) * needleLen
    const ny = Math.sin(needleAngle - Math.PI / 2) * needleLen
    g.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', nx).attr('y2', ny)
      .attr('stroke', 'var(--app-fg)')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.7)
    g.append('circle').attr('r', 4).attr('fill', 'var(--app-fg)').attr('opacity', 0.7)

    // Value label
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-1.4em')
      .attr('font-size', '20')
      .attr('font-weight', '800')
      .attr('fill', colorScale(value))
      .text(`${value}%`)

    // Min / Max labels
    const lx = Math.cos(startAngle - Math.PI / 2) * (outerR + 8)
    const ly = Math.sin(startAngle - Math.PI / 2) * (outerR + 8)
    const rx = Math.cos(endAngle - Math.PI / 2) * (outerR + 8)
    const ry = Math.sin(endAngle - Math.PI / 2) * (outerR + 8)
    g.append('text').attr('x', lx).attr('y', ly).attr('text-anchor', 'middle').attr('font-size', '8').attr('fill', 'var(--sidebar-muted)').text('0%')
    g.append('text').attr('x', rx).attr('y', ry).attr('text-anchor', 'middle').attr('font-size', '8').attr('fill', 'var(--sidebar-muted)').text('100%')
  }, [value, size])

  return <svg ref={svgRef} width={size} height={size * 0.6} />
}
