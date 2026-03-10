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
    const cy = h           // centre en bas du SVG → demi-cercle toujours visible
    const outerR = w * 0.44
    const innerR = outerR - 14
    const startAngle = -Math.PI / 2   // 9h (gauche)
    const endAngle   =  Math.PI / 2   // 3h (droite)

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`)

    // Background arc
    const bgArc = d3.arc()({ innerRadius: innerR, outerRadius: outerR, startAngle, endAngle } as d3.DefaultArcObject)
    g.append('path').attr('d', bgArc!).attr('fill', '#374151') // gray-700

    // Color stops: red → amber → green
    const colorScale = d3.scaleLinear<string>()
      .domain([0, 50, 100])
      .range(['#ef4444', '#f59e0b', '#22c55e'])

    const fillAngle = startAngle + (endAngle - startAngle) * (value / 100)
    if (value > 0) {
      const fillArc = d3.arc()({ innerRadius: innerR, outerRadius: outerR, startAngle, endAngle: fillAngle } as d3.DefaultArcObject)
      g.append('path').attr('d', fillArc!).attr('fill', colorScale(value))
    }

    // Needle — en coords D3 : x = r·sin(θ), y = -r·cos(θ)
    const needleAngle = startAngle + (endAngle - startAngle) * (value / 100)
    const needleLen = outerR - 6
    const nx = Math.sin(needleAngle) * needleLen
    const ny = -Math.cos(needleAngle) * needleLen

    g.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', nx).attr('y2', ny)
      .attr('stroke', '#f9fafb')   // gray-50
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')

    g.append('circle').attr('r', 5).attr('fill', '#f9fafb')

    // Value label
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-1.6em')
      .attr('font-size', '20')
      .attr('font-weight', '800')
      .attr('fill', colorScale(value))
      .text(`${value}%`)

    // Min / Max labels
    const lx = Math.sin(startAngle) * (outerR + 10)
    const ly = -Math.cos(startAngle) * (outerR + 10)
    const rx = Math.sin(endAngle)   * (outerR + 10)
    const ry = -Math.cos(endAngle)  * (outerR + 10)
    g.append('text').attr('x', lx).attr('y', ly).attr('text-anchor', 'middle').attr('font-size', '8').attr('fill', '#9ca3af').text('0%')
    g.append('text').attr('x', rx).attr('y', ry).attr('text-anchor', 'middle').attr('font-size', '8').attr('fill', '#9ca3af').text('100%')
  }, [value, size])

  return <svg ref={svgRef} width={size} height={size * 0.6} />
}
