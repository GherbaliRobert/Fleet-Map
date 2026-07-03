// leaflet.heat nu are tipuri proprii — declarăm modulul (side-effect import) și extindem L cu heatLayer.
declare module 'leaflet.heat';
import 'leaflet';
declare module 'leaflet' {
  function heatLayer(latlngs: Array<[number, number, number?]>, options?: any): any;
}
