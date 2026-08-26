// can_flag_io.js — puntea între steagurile trimise ca SEMNALE SEPARATE și plăcuțele din interfață.
//
// De ce există. Adaptorul ALL-CAN300 poate trimite stările mașinii în două feluri, iar asta depinde
// de programul încărcat în adaptor, nu de noi:
//   (a) ÎMPACHETAT — un singur semnal pe 8 octeți, cu câte un bit pentru fiecare stare
//       (`can_security_state_flags`, P2/P4). Îl desface codec8e în `_security_flags`.
//   (b) SEPARAT — câte un semnal AVL pentru fiecare stare: 654 = ușa șofer, 928 = lumini de poziție…
//
// VW Passat B7 (B112RFG), program 11173, trimite varianta (b): 60+ semnale individuale. Plăcuțele
// din aplicație citeau DOAR varianta (a), așa că ecranul rămânea gol pe o mașină care, de fapt,
// trimitea totul. Tabelul de aici leagă fiecare semnal individual de ACELAȘI steag pe care îl
// produce și varianta împachetată — deci plăcuțele, categoriile și explicațiile merg neschimbate,
// indiferent cum trimite mașina.
//
// Cheile din stânga sunt ID-uri AVL oficiale (tools/fixtures/avl-fmc130.json). Cele din dreapta sunt
// steagurile din can_flags.js. `verify_io_map.js` verifică amândouă capetele: fiecare ID există în
// specul oficial, fiecare steag are plăcuță.

// ── SSF — Security State Flags (starea mașinii: contact, uși, transmisie, alarmă) ──────────────
const SSF = {
  898: '_sf_ignition_on',
  652: '_sf_key_in_ignition',
  899: '_sf_webasto',
  900: '_sf_engine_working',
  901: '_sf_standalone_engine',
  902: '_sf_ready_to_drive',
  903: '_sf_cng_running',
  904: '_sf_work_mode_private',
  905: '_sf_operator_present',
  906: '_sf_interlock',
  907: '_sf_engine_lock',
  908: '_sf_engine_lock_request',
  653: '_sf_handbrake',
  910: '_sf_footbrake',
  911: '_sf_clutch',
  912: '_sf_hazard_lights',
  654: '_sf_door_front_left',
  655: '_sf_door_front_right',
  656: '_sf_door_rear_left',
  657: '_sf_door_rear_right',
  658: '_sf_trunk_open',
  913: '_sf_hood_open',
  909: '_sf_roof_open',
  914: '_sf_charging_cable',
  915: '_sf_battery_charging',
  916: '_sf_electric_engine',
  917: '_sf_closed_by_remote',
  662: '_sf_car_closed',
  918: '_sf_factory_alarm',
  919: '_sf_alarm_emulated',
  920: '_sf_remote_close',
  921: '_sf_remote_open',
  922: '_sf_rearm_signal',
  923: '_sf_trunk_remote_open',
  924: '_sf_can_sleep_mode',
  925: '_sf_remote_arm3x',
  926: '_sf_factory_armed',
  660: '_sf_parking',
  661: '_sf_reverse',
  659: '_sf_neutral',
  927: '_sf_drive',
  1083: '_sf_dual_fuel',
  1084: '_sf_lpg_running',
  1211: '_sf_window_front_left',
  1212: '_sf_window_front_right',
  1213: '_sf_window_rear_left',
  1214: '_sf_window_rear_right',
};

// ── CSF — Control State Flags (lumini, confort, transmisie de camion) ──────────────────────────
const CSF = {
  928: '_cf_parking_lights',
  929: '_cf_dipped_headlights',
  930: '_cf_full_beam',
  931: '_cf_rear_fog_lights',
  932: '_cf_front_fog_lights',
  933: '_cf_additional_front_lights',
  934: '_cf_additional_rear_lights',
  935: '_cf_light_signal',
  936: '_cf_air_conditioning',
  937: '_cf_cruise_control',
  938: '_cf_auto_retarder',
  939: '_cf_manual_retarder',
  // Numele oficiale ale centurilor sunt derutante („Front Driver's Seatbelt"); ordinea urmează
  // exact ordinea biților din P4 (12 = șofer, 13 = pasager față, 14/15/16 = spate).
  940: '_cf_driver_seatbelt',
  941: '_cf_passenger_seatbelt',
  942: '_cf_seatbelt_rear_left',
  943: '_cf_seatbelt_rear_right',
  944: '_cf_seatbelt_rear_centre',
  945: '_cf_passenger_present',
  946: '_cf_pto_on',
  947: '_cf_diff_front_locked',
  948: '_cf_diff_rear_locked',
  949: '_cf_diff_central_locked',
  950: '_cf_diff_central_reductor',
  951: '_cf_trailer_axle1_lift',
  952: '_cf_trailer_axle2_lift',
  1085: '_cf_trailer_connected',
  1086: '_cf_start_stop_inactive',
};

// ── ISF — Indicator State Flags (martorii din bord) ────────────────────────────────────────────
const ISF = {
  953: '_cf_check_engine',
  954: '_cf_abs_warning',
  955: '_cf_esp_warning',
  956: '_cf_esp_off',
  957: '_cf_stop_indicator',
  958: '_cf_oil_pressure_warning',   // oficial „Oil Level Indicator" = martorul de ulei (presiune/nivel)
  959: '_cf_coolant_warning',
  960: '_cf_battery_warning',
  961: '_cf_handbrake_warning',
  962: '_cf_airbag_warning',
  963: '_cf_eps_warning',
  964: '_cf_general_warning',
  965: '_cf_lights_failure',
  966: '_cf_low_tire_pressure',
  967: '_cf_brake_pad_wear',
  968: '_cf_low_fuel',
  969: '_cf_maintenance',
  970: '_cf_glow_plug',
  971: '_cf_dpf_warning',            // FAP = filtrul de particule
  972: '_cf_epc_warning',
  973: '_cf_oil_filter_clogged',
  974: '_cf_oil_pressure_low',
  975: '_cf_oil_temp_high',
  976: '_cf_coolant_low',
  977: '_cf_hydraulic_filter_clogged',
  978: '_cf_hydraulic_low_pressure',
  979: '_cf_hydraulic_oil_low',
  980: '_cf_hydraulic_high_temp',
  981: '_cf_hydraulic_oil_overflow',
  982: '_cf_air_filter_clogged',
  983: '_cf_fuel_filter_clogged',
  984: '_cf_water_in_fuel',
  985: '_cf_brake_filter_clogged',
  986: '_cf_washer_fluid_low',
  987: '_cf_adblue_low',
  988: '_cf_trailer_tire_pressure_low',
  989: '_cf_trailer_brake_wear',
  990: '_cf_trailer_brake_temp_high',
  991: '_cf_trailer_pneumatic_bad',
  992: '_cf_cng_low',
};

const PE_ID = Object.assign({}, SSF, CSF, ISF);

// Semnale la care 1 înseamnă CONTRARIUL plăcuței. Deocamdată unul singur, dar merită tratat curat:
// oficial, „SSF Work Mode" e 0 = personal, 1 = serviciu — iar plăcuța noastră se numește „Regim
// personal". Fără inversare, o mașină de serviciu apărea ca fiind în regim personal (se vedea chiar
// pe Passat, unde semnalul e 1).
const INVERS = new Set([904]);

module.exports = { SSF, CSF, ISF, PE_ID, INVERS };
