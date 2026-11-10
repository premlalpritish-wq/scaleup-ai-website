/**
 * ScaleUp AI - Chemical Process Simulation Engine
 * Model: Steam Methane Reforming Pre-Reformer Skid (M-101 + E-102 + R-102)
 * Provenance: CAPE3000 Design Project Report (Samarpit Nag, 201543288, 2024)
 * Kinetic Citations: Singh & Saraf (1979), Hyman (1968), Oechsler et al. (2020)
 * Momentum: Ergun (1952) with Coker/Ward sphericity correction
 * Mechanical: ASME Boiler and Pressure Vessel Code Section VIII Div 1
 */

class PreReformerSolver {
  constructor() {
    // Physical Constants & Reactor Dimensions (Samar Report Chapter 2 & Data Sheet p. 34)
    this.D_inner = 1.70; // Inner diameter, m (p. 19, 34)
    this.A_c = Math.PI * Math.pow(this.D_inner / 2, 2); // 2.269 m2 (Eq 2.22)
    this.L_bed = 1.156; // Catalyst bed length, m (p. 24, Table B5-3)
    this.L_total = 6.712; // Total reactor height, m (p. 34, 50)
    this.t_wall = 0.0889; // 316N vessel thickness, m (88.9 mm, p. 34, 50)
    this.t_ins = 0.077; // 85% mineral wool insulation, m (77 mm / 3", p. 34, 50)
    this.h_top_inert = 0.077; // Top T-162 alumina support layer, m (p. 34)
    this.h_bot_inert = 0.089; // Bottom T-162 alumina support layer, m (p. 34)

    // Catalyst Properties: AR-401 (Ni-MgO on alpha-Al2O3)
    this.rho_bulk = 1442.0; // Bulk density, kg/m3 (p. 20)
    this.rho_pellet = 2641.08; // Pellet density, kg/m3 (Eq 2.27)
    this.d_p = 0.005; // Pellet diameter, 5 mm (p. 20)
    this.L_p = 0.005; // Pellet length, 5 mm (p. 20)
    this.sphericity = 0.874; // Sphericity phi (Eq 2.25)
    this.voidage = 0.454; // Bed porosity epsilon (Eq 2.26)
    this.catalyst_mass = 3772.52; // Total catalyst charge, kg (p. 50)

    // Fluid Viscosity & Thermodynamics
    this.mu_f = 2.082e-5; // Pa.s at 370°C (p. 21, 24)
    this.Cp_avg = 42.98; // kJ/(kmol.K) (p. 23)
    this.R = 8.314; // Universal gas constant, J/(mol.K) or kJ/(kmol.K)

    // Heats of Reaction (kJ/kmol)
    this.dHr_crack_c2 = 347190.0; // C2H6 cracking, kJ/kmol (Eq 2.1)
    this.dHr_crack_c3 = 497560.0; // C3H8 cracking, kJ/kmol (Eq 2.2)
    this.dHr1_meth = 2.37e5; // Methanation at 370°C, kJ/kmol (Eq 2.50)
    
    // WGS Enthalpy Options:
    // 1) Samar written Eq. 2.51: -3.75e5 kJ/kmol (-375 kJ/mol)
    // 2) Corrected NIST Standard: -3.75e4 kJ/kmol (-37.5 kJ/mol)
    this.dHr2_wgs_euler = -3.75e5;
    this.dHr2_wgs_corrected = -3.75e4;

    // E-102 Heat Exchanger Baseline
    this.U_E102 = 65.0; // Overall heat transfer coefficient, W/(m2.K) (p. 2, 50)
    this.tubes_E102 = 636; // Tube count, BS-3606 steel (p. 2, 50)
    this.passes_E102 = 2; // Two passes (p. 2)
    this.T_flue_in = 960.0; // Flue gas inlet, °C (Table 1-1)
    this.T_flue_out = 827.5; // Flue gas outlet, °C (Table 1-1)
    this.m_flue = 154.67; // Flue gas mass flow, kg/s (Table 1-1)

    // ASME Section VIII Div 1 limits
    this.S_allowable = 61.5; // N/mm2 at 478°C for 316N (Eq 4.02)
    this.P_design = 137.89; // Design pressure, bar (p. 34)
  }

  evaluateUpstream(m_feed_kgs, T_preheat_target, sc_ratio) {
    const T_mixer_out = 225.2; // °C (Stream 6, Table 1-1)
    const isBelowCrackingThreshold = T_preheat_target < 350.0;
    
    const Cp_mix_mass = 2.45; // kJ/(kg.K) average
    const Q_E102_kW = m_feed_kgs * Cp_mix_mass * Math.max(0, T_preheat_target - T_mixer_out);
    
    const Cp_flue_mass = 1.15; // kJ/(kg.K)
    const deltaT_flue = Q_E102_kW / (this.m_flue * Cp_flue_mass);
    const T_flue_actual_out = Math.max(250.0, this.T_flue_in - deltaT_flue);

    const flow_scale = m_feed_kgs / 29.78;
    const sc_factor = sc_ratio / 3.0;

    const F7_CH4 = 1546.14 * flow_scale;
    const F7_C2H6 = 48.53 * flow_scale;
    const F7_C3H8 = 19.41 * flow_scale;
    const F7_CO = 0.0005 * flow_scale;
    const F7_CO2 = 5.95 * flow_scale;
    const F7_H2O = 4772.21 * flow_scale * sc_factor;
    const F7_H2 = 0.0054 * flow_scale;
    const F7_N2 = 0.48 * flow_scale;

    let F7A_CH4, F7A_CO, F7A_CO2, F7A_H2O, F7A_H2, F7A_N2;
    let T_bed_inlet;

    if (!isBelowCrackingThreshold) {
      F7A_CH4 = 1529.40 * flow_scale;
      F7A_CO = 153.63 * flow_scale;
      F7A_CO2 = 6.07 * flow_scale;
      F7A_H2O = 4719.44 * flow_scale * sc_factor;
      F7A_H2 = 374.47 * flow_scale;
      F7A_N2 = 0.48 * flow_scale;

      const deltaT_endothermic = 108.28;
      T_bed_inlet = T_preheat_target - deltaT_endothermic;
    } else {
      F7A_CH4 = F7_CH4;
      F7A_CO = 0.001;
      F7A_CO2 = F7_CO2;
      F7A_H2O = F7_H2O;
      F7A_H2 = 0.001;
      F7A_N2 = F7_N2;
      T_bed_inlet = T_preheat_target;
    }

    return {
      T_mixer_out,
      T_preheat_actual: T_preheat_target,
      T_flue_actual_out: +T_flue_actual_out.toFixed(1),
      Q_E102_kW: +Q_E102_kW.toFixed(1),
      isBelowCrackingThreshold,
      T_bed_inlet: +T_bed_inlet.toFixed(2),
      Stream7: {
        F_CH4: F7_CH4, F_C2H6: F7_C2H6, F_C3H8: F7_C3H8, F_CO: F7_CO,
        F_CO2: F7_CO2, F_H2O: F7_H2O, F_H2: F7_H2, F_N2: F7_N2
      },
      Stream7A: {
        F_CH4: F7A_CH4,
        F_CO: F7A_CO,
        F_CO2: F7A_CO2,
        F_H2O: F7A_H2O,
        F_H2: F7A_H2,
        F_N2: F7A_N2,
        total_kmol_h: F7A_CH4 + F7A_CO + F7A_CO2 + F7A_H2O + F7A_H2 + F7A_N2
      }
    };
  }

  /**
   * Deterministic 1D Pseudo-Homogeneous PFR Axial Solver
   * @param {number} m_feed_kgs - Mass flow (kg/s)
   * @param {number} T_preheat - Preheat temperature (°C)
   * @param {number} P_inlet_bar - Inlet pressure (bar)
   * @param {number} sc_ratio - S/C molar ratio
   * @param {string} solverBasis - 'euler' | 'corrected'
   */
  solvePFR(m_feed_kgs = 29.78, T_preheat = 478.3, P_inlet_bar = 38.91, sc_ratio = 3.0, solverBasis = 'euler') {
    const upstream = this.evaluateUpstream(m_feed_kgs, T_preheat, sc_ratio);
    
    let { F_CH4, F_CO, F_CO2, F_H2O, F_H2, F_N2 } = upstream.Stream7A;
    let T = upstream.T_bed_inlet + 273.15; // Kelvin
    let P = P_inlet_bar; // bar

    // Select WGS Enthalpy based on toggle
    const dHr2_wgs = (solverBasis === 'corrected') ? this.dHr2_wgs_corrected : this.dHr2_wgs_euler;

    const dz = 0.02; // Step size, m
    const num_steps = Math.round(this.L_bed / dz); // 58 steps = 1.16 m

    const profile = [];
    let cumulative_tau = 0.0;

    for (let step = 0; step <= num_steps; step++) {
      const z = +(step * dz).toFixed(3);
      const F_total = F_CH4 + F_CO + F_CO2 + F_H2O + F_H2 + F_N2;

      const y_CH4 = F_CH4 / F_total;
      const y_CO = F_CO / F_total;
      const y_CO2 = F_CO2 / F_total;
      const y_H2O = F_H2O / F_total;
      const y_H2 = F_H2 / F_total;
      const y_N2 = F_N2 / F_total;

      const MW = y_CH4 * 16.04 + y_CO * 28.01 + y_CO2 * 44.01 + y_H2O * 18.015 + y_H2 * 2.016 + y_N2 * 28.01;
      const rho_g = (P * 1e5 * MW * 1e-3) / (this.R * T);

      const mass_flow_h = (F_CH4 * 16.04 + F_CO * 28.01 + F_CO2 * 44.01 + F_H2O * 18.015 + F_H2 * 2.016 + F_N2 * 28.01);
      const Q_m3s = (mass_flow_h / 3600.0) / rho_g;
      const vf = Q_m3s / this.A_c;

      const Re = (rho_g * vf * this.d_p) / this.mu_f;

      const V_slice = this.A_c * dz;
      const d_tau = this.voidage * (V_slice / Q_m3s);
      cumulative_tau += d_tau;

      // Kinetics
      const k1 = 127.0 * Math.exp(-36751.0 / (this.R * T));
      const k2 = 3041.1 * Math.exp(-58150.0 / (this.R * T));

      const K1 = Math.exp(30.707 - 27464.0 / T);
      const K2 = Math.exp(-4.333 + 4578.0 / T);

      const denom1 = Math.max(1e-12, K1 * y_H2O);
      const diff1 = y_CH4 - (y_CO * Math.pow(y_H2, 3)) / denom1;
      const r1 = k1 * Math.sqrt(P) * diff1;

      const denom2 = Math.max(1e-12, K2 * y_H2O);
      const diff2 = y_CO - (y_CO2 * y_H2) / denom2;
      const r2 = k2 * Math.sqrt(P) * diff2;

      // Mechanical stress
      const P_Pa = P * 1e5;
      const R_inner = this.D_inner / 2.0;
      const sigma_hoop = (P_Pa * R_inner) / this.t_wall / 1e6;
      const sigma_long = (P_Pa * R_inner) / (2.0 * this.t_wall) / 1e6;
      const safety_factor = this.S_allowable / Math.max(1e-3, sigma_hoop);

      profile.push({
        step,
        z,
        T_C: +(T - 273.15).toFixed(2),
        T_K: +T.toFixed(2),
        P_bar: +P.toFixed(3),
        P_kPa: +(P * 100.0).toFixed(1),
        y_CH4: +y_CH4.toFixed(4),
        y_CO: +y_CO.toFixed(4),
        y_CO2: +y_CO2.toFixed(4),
        y_H2O: +y_H2O.toFixed(4),
        y_H2: +y_H2.toFixed(4),
        y_N2: +y_N2.toFixed(6),
        F_CH4: +F_CH4.toFixed(2),
        F_CO: +F_CO.toFixed(2),
        F_CO2: +F_CO2.toFixed(2),
        F_H2O: +F_H2O.toFixed(2),
        F_H2: +F_H2.toFixed(2),
        vf: +vf.toFixed(3),
        Re: +Re.toFixed(1),
        rho_g: +rho_g.toFixed(2),
        tau_s: +cumulative_tau.toFixed(4),
        r1: +r1.toFixed(5),
        r2: +r2.toFixed(5),
        sigma_hoop: +sigma_hoop.toFixed(2),
        sigma_long: +sigma_long.toFixed(2),
        safety_factor: +safety_factor.toFixed(2)
      });

      if (step === num_steps) break;

      const cat_slice_mass = this.A_c * this.rho_bulk * dz;
      const dF_CH4 = -cat_slice_mass * r1;
      const dF_CO_rxn = -cat_slice_mass * r2;

      // Temperature differential with chosen dHr2_wgs basis
      const heat_gen_kJ_h = cat_slice_mass * ((-this.dHr1_meth * r1) + (-dHr2_wgs * (-r2)));
      const dT = heat_gen_kJ_h / (F_total * this.Cp_avg);

      // Ergun Equation
      const term_laminar = 150.0 * (this.mu_f / Math.pow(this.sphericity * this.d_p, 2)) *
        (Math.pow(1.0 - this.voidage, 2) / Math.pow(this.voidage, 3)) * vf;
      const term_turbulent = 1.75 * (rho_g / (this.sphericity * this.d_p)) *
        ((1.0 - this.voidage) / Math.pow(this.voidage, 3)) * Math.pow(vf, 2);
      const dP_Pa = (term_laminar + term_turbulent) * dz;
      const dP_bar = dP_Pa / 1e5;

      F_CH4 = Math.max(0.1, F_CH4 + dF_CH4);
      F_CO = Math.max(0.1, F_CO - dF_CH4 + dF_CO_rxn);
      F_CO2 = Math.max(0.1, F_CO2 - dF_CO_rxn);
      F_H2O = Math.max(0.1, F_H2O + dF_CH4 + dF_CO_rxn);
      F_H2 = Math.max(0.1, F_H2 - 3.0 * dF_CH4 - dF_CO_rxn);

      T += dT;
      P = Math.max(1.0, P - dP_bar);
    }

    const outlet = profile[profile.length - 1];
    const inlet = profile[0];

    // Radial Thermal Lagging Inspector
    const k_ins = 0.045;
    const r_inner = this.D_inner / 2.0;
    const r_outer_steel = r_inner + this.t_wall;
    const r_outer_ins = r_outer_steel + this.t_ins;
    const T_bed_peak = Math.max(...profile.map(p => p.T_C));
    const T_ambient = 15.0;
    const h_ambient = 10.0;
    
    const R_steel = Math.log(r_outer_steel / r_inner) / (2.0 * Math.PI * 15.0);
    const R_ins = Math.log(r_outer_ins / r_outer_steel) / (2.0 * Math.PI * k_ins);
    const R_conv = 1.0 / (2.0 * Math.PI * r_outer_ins * h_ambient);
    const R_total = R_steel + R_ins + R_conv;
    const q_loss_linear = (T_bed_peak - T_ambient) / R_total;
    const T_outer_skin_C = +(T_ambient + q_loss_linear * R_conv).toFixed(1);

    return {
      upstream,
      profile,
      inlet,
      outlet,
      solverBasis,
      summary: {
        T_bed_in_C: inlet.T_C,
        T_bed_peak_C: +T_bed_peak.toFixed(2),
        T_bed_out_C: outlet.T_C,
        P_in_bar: inlet.P_bar,
        P_out_bar: outlet.P_bar,
        deltaP_bed_bar: +(inlet.P_bar - outlet.P_bar).toFixed(3),
        total_tau_s: outlet.tau_s,
        T_outer_skin_C,
        isSafeSkin: T_outer_skin_C < 55.0,
        max_hoop_stress_MPa: Math.max(...profile.map(p => p.sigma_hoop)),
        min_safety_factor: Math.min(...profile.map(p => p.safety_factor))
      }
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PreReformerSolver;
}
