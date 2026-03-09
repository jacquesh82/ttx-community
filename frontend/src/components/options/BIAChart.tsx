import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { BIAProcess } from './BIAManager'

interface BIAChartProps {
  processes: BIAProcess[]
  onSelectProcess?: (p: BIAProcess) => void
}

const CRITICALITY_ORDER = ['faible', 'moyen', 'critique', 'vital'] as const
const CRITICALITY_COLORS: Record<string, string> = {
  faible: '#22c55e',
  moyen: '#f59e0b',
  critique: '#ef4444',
  vital: '#991b1b',
}

export default function BIAChart({ processes, onSelectProcess }: BIAChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: BIAProcess } | null>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth || 600
    const height = 280
    const marginTop = 20
    const marginRight = 20
    const marginBottom = 40
    const marginLeft = 80

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    if (processes.length === 0) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6b7280')
        .attr('font-size', 14)
        .text('Aucun processus BIA défini')
      return
    }

    const maxRTO = Math.max(...processes.map((p) => p.rto_hours), 8)
    const maxMTPD = Math.max(...processes.map((p) => p.mtpd_hours), 1)

    const xScale = d3.scaleLinear([0, maxRTO], [marginLeft, width - marginRight])
    const yScale = d3.scalePoint(CRITICALITY_ORDER as unknown as string[], [
      height - marginBottom,
      marginTop,
    ])
    const rScale = d3.scaleSqrt([0, maxMTPD], [6, 28])

    // Axes
    const xAxis = d3.axisBottom(xScale).ticks(6).tickFormat((d) => `${d}h`)
    svg
      .append('g')
      .attr('transform', `translate(0,${height - marginBottom})`)
      .call(xAxis)
      .selectAll('text, line, path')
      .attr('stroke', '#4b5563')
      .attr('fill', '#9ca3af')

    const yAxis = d3.axisLeft(yScale)
    svg
      .append('g')
      .attr('transform', `translate(${marginLeft},0)`)
      .call(yAxis)
      .selectAll('text, line, path')
      .attr('stroke', '#4b5563')
      .attr('fill', '#9ca3af')

    // Gridlines
    svg
      .append('g')
      .selectAll('line')
      .data(xScale.ticks(6))
      .join('line')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', marginTop)
      .attr('y2', height - marginBottom)
      .attr('stroke', '#374151')
      .attr('stroke-dasharray', '3,3')

    // Bubbles
    const bubbles = svg
      .append('g')
      .selectAll('g')
      .data(processes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_, d) => onSelectProcess?.(d))
      .on('mousemove', (event, d) => {
        const rect = container.getBoundingClientRect()
        setTooltip({
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top - 10,
          p: d,
        })
      })
      .on('mouseout', () => setTooltip(null))

    bubbles
      .append('circle')
      .attr('cx', (d) => xScale(d.rto_hours))
      .attr('cy', (d) => yScale(d.criticality) ?? 0)
      .attr('r', (d) => rScale(d.mtpd_hours))
      .attr('fill', (d) => CRITICALITY_COLORS[d.criticality] ?? '#6b7280')
      .attr('fill-opacity', 0.7)
      .attr('stroke', (d) => CRITICALITY_COLORS[d.criticality] ?? '#6b7280')
      .attr('stroke-width', 1.5)

    bubbles
      .append('text')
      .attr('x', (d) => xScale(d.rto_hours))
      .attr('y', (d) => (yScale(d.criticality) ?? 0) + 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', 11)
      .attr('pointer-events', 'none')
      .text((d) => (d.process_name.length > 12 ? d.process_name.slice(0, 11) + '…' : d.process_name))

    // X axis label
    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', height - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6b7280')
      .attr('font-size', 12)
      .text('RTO (heures)')
  }, [processes, onSelectProcess])

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} className="w-full" />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded bg-gray-900 border border-gray-600 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-semibold mb-1">{tooltip.p.process_name}</div>
          {tooltip.p.department && <div className="text-gray-400">{tooltip.p.department}</div>}
          <div>RTO : <span className="text-white">{tooltip.p.rto_hours}h</span></div>
          <div>RPO : <span className="text-white">{tooltip.p.rpo_minutes} min</span></div>
          <div>MTPD : <span className="text-white">{tooltip.p.mtpd_hours}h</span></div>
          <div>Priorité : <span className="text-white">{tooltip.p.priority}</span></div>
        </div>
      )}
    </div>
  )
}
