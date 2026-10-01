"use client";

import { useCallback, useEffect, useState } from "react";

export function useExpandedKanbanLayout() {
  const [flowsNode, setFlowsNode] = useState<HTMLDivElement | null>(null);
  const [timerChartNode, setTimerChartNode] = useState<HTMLDivElement | null>(null);
  const [painelNode, setPainelNode] = useState<HTMLDivElement | null>(null);
  const [flowsBoardHeight, setFlowsBoardHeight] = useState<number>();
  const [painelBoardHeight, setPainelBoardHeight] = useState<number>();

  const flowsSectionRef = useCallback((node: HTMLDivElement | null) => setFlowsNode(node), []);
  const timerChartRef = useCallback((node: HTMLDivElement | null) => setTimerChartNode(node), []);
  const painelSectionRef = useCallback((node: HTMLDivElement | null) => setPainelNode(node), []);

  useEffect(() => {
    if ((!flowsNode && !painelNode) || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      if (window.innerWidth >= 1024) {
        if (flowsNode && timerChartNode) {
          const availableHeight = flowsNode.clientHeight - timerChartNode.clientHeight - 72;
          const nextHeight = Math.max(240, Math.round(availableHeight * 1.5));
          setFlowsBoardHeight((current) => current === nextHeight ? current : nextHeight);
        }
        if (painelNode) {
          const nextHeight = Math.max(240, Math.round((painelNode.clientHeight - 48) * 1.5));
          setPainelBoardHeight((current) => current === nextHeight ? current : nextHeight);
        }
      } else {
        setFlowsBoardHeight(undefined);
        setPainelBoardHeight(undefined);
      }
    };

    // The viewport and fixed timer/chart row are observed, never the expanded
    // board. Its own height therefore cannot create a ResizeObserver feedback loop.
    const observer = new ResizeObserver(measure);
    if (flowsNode) observer.observe(flowsNode);
    if (timerChartNode) observer.observe(timerChartNode);
    if (painelNode) observer.observe(painelNode);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [flowsNode, timerChartNode, painelNode]);

  return { flowsSectionRef, timerChartRef, painelSectionRef, flowsBoardHeight, painelBoardHeight };
}