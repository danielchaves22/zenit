// Este arquivo fornece declarações de módulo minimalistas para recharts
// permitindo que o build prossiga sem erros de tipo

declare module 'recharts' {
  import { ReactNode, ComponentType } from 'react';

  // Interfaces básicas
  export interface ChartProps {
    width?: number;
    height?: number;
    data?: any[];
    margin?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
    children?: ReactNode;
  }

  // Componentes exportados
  export const ResponsiveContainer: ComponentType<{
    width?: number | string;
    height?: number | string;
    children?: ReactNode;
  }>;

  export const BarChart: ComponentType<ChartProps>;
  export const LineChart: ComponentType<ChartProps>;
  export const PieChart: ComponentType<ChartProps>;
  export const AreaChart: ComponentType<ChartProps>;
  
  export const Bar: ComponentType<{
    dataKey: string;
    fill?: string;
    stroke?: string;
    name?: string;
    [key: string]: any;
  }>;

  export const Line: ComponentType<{
    dataKey: string;
    stroke?: string;
    name?: string;
    [key: string]: any;
  }>;

  export const XAxis: ComponentType<{
    dataKey?: string;
    [key: string]: any;
  }>;

  export const YAxis: ComponentType<{
    dataKey?: string;
    [key: string]: any;
  }>;

  export const CartesianGrid: ComponentType<{
    strokeDasharray?: string;
    [key: string]: any;
  }>;

  export const Tooltip: ComponentType<{
    formatter?: (value: any, name?: string, props?: any) => any;
    [key: string]: any;
  }>;

  export const Legend: ComponentType<{
    [key: string]: any;
  }>;
}