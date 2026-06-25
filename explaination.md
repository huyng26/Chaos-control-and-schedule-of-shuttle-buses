# Chaos control and scheduling of shuttle buses

This document explains the model in Takashi Nagatani’s 2006 paper, *Chaos control and schedule of shuttle buses*, and how the accompanying implementation reproduces its main results.

## 1. The physical idea

Several buses repeatedly travel from an origin to a destination and back. Passengers arrive continuously at the origin.

A bus that arrives after a long gap finds more waiting passengers. It therefore:

1. spends longer loading and unloading them;
2. starts its next tour later;
3. attempts to recover some of that delay by driving faster.

The buses may pass each other. This matters because the passengers collected by a bus are determined by the **most recent bus arrival at the origin**, which need not be the same bus on every trip.

This creates a feedback loop:

> large headway → more passengers → longer stop → changed tour time → changed arrival order → new headway

Even though the model contains no random noise, that feedback can produce periodic motion and deterministic chaos.

## 2. From the physical model to the nonlinear map

For bus $i$ on trip $m$, let:

- $t_i(m)$: arrival time at the origin;
- $B_i(m)$: number of boarding passengers;
- $\mu$: passenger arrival rate;
- $\gamma$: boarding time per passenger;
- $\eta$: unloading time per passenger;
- $L$: one-way route length;
- $V_i(m)$: mean travel speed;
- $V_0$: normal speed;
- $s_i$: speedup strength.

The complete tour consists of loading, unloading, and travel:

$$
t_i(m+1)
=t_i(m)+(\gamma+\eta)B_i(m)+\frac{2L}{V_i(m)}.
$$

If bus $i'$ was the bus that arrived immediately before bus $i$, their time gap is

$$
h_i(m)=t_i(m)-t_{i'}(m').
$$

Passengers arrive at a constant rate, so

$$
B_i(m)=\mu h_i(m).
$$

The speedup rule is

$$
V_i(m)=V_0+s_i(\gamma+\eta)B_i(m).
$$

After scaling time by the normal travel time $2L/V_0$, the model becomes

$$
\boxed{
T_i(m+1)
=T_i(m)+\Gamma H_i(m)
+\frac{1}{1+S_iH_i(m)}
}
$$

with

$$
\Gamma=\mu(\gamma+\eta),
\qquad
S_i=\frac{s_i\mu(\gamma+\eta)2L}{V_0^2}.
$$

The two dimensionless controls are:

- **loading parameter $\Gamma$** — how strongly a long headway increases stopping delay;
- **speedup parameter $S_i$** — how strongly bus $i$ recovers that delay.

The first term after $T_i(m)$ increases the next arrival time. The reciprocal term is the moving time and decreases as speedup becomes stronger.

## 3. Why arrival order is the difficult part

The map is simple, but its predecessor $i'$ changes whenever one bus overtakes another. It is therefore incorrect to assume that bus 1 always follows bus 2 or vice versa.

The implementation is event-driven:

1. keep one pending next arrival for each bus;
2. select the earliest pending arrival;
3. compute its headway from the previous global arrival;
4. apply the nonlinear map;
5. insert that bus’s next arrival;
6. repeat.

For the paper’s two-bus case, `shuttle_model.py` uses a specialized two-way merge. A priority queue is used as the general fallback for more buses.

## 4. Quantities plotted in the paper

### Headway

$$
H_i(m)=T_i(m)-T_{i'}(m')
$$

is the gap between bus $i$ and the globally preceding arrival.

### Tour time

$$
\Delta T_i(m)=T_i(m+1)-T_i(m)
$$

is the duration of one complete round trip by bus $i$.

### Return map

The return map plots

$$
H_1(m+1) \quad \text{against} \quad H_1(m).
$$

A finite set of points indicates periodic motion. A curve or extended piecewise set indicates chaotic motion. At $\Gamma=0.2$, $S_1=0.5$, and $S_2=0.2$, the simulation recovers the paper’s period-11 orbit.

### Mean and RMS fluctuation

For an observable $X$, the code computes

$$
\bar X=\frac{1}{N}\sum_m X(m),
\qquad
X_{\mathrm{rms}}
=\sqrt{\frac{1}{N}\sum_m\left(X(m)-\bar X\right)^2}.
$$

Regular motion has essentially zero RMS after transients. Periodic and chaotic motion has nonzero RMS.

## 5. Main results

- Without speedup, the bus motion is chaotic over much of $0<\Gamma<2$, and diverges near $\Gamma=2$.
- Equal speedup suppresses fluctuations below a transition loading.
- Unequal speedups produce richer period-adding bifurcations and chaotic regimes.
- For $S_1=0.5$, $S_2=0.2$, the paper reports transitions near $\Gamma=0.167$, $0.248$, and $0.407$.
- The speedup parameter can therefore act as a deterministic chaos-control mechanism.

For equal speedups $S_1=S_2=S$, the regular-branch boundary can also be derived. Equal tour times on the unequal-headway branch imply

$$
\Gamma
=\frac{S}{(1+SH_1)(1+SH_2)}.
$$

At the bunching transition, $H_1\to0$ and $H_2\to1$, giving

$$
\boxed{\Gamma_c=\frac{S}{1+S}}.
$$

For $S=0.2$, this gives $\Gamma_c=1/6\approx0.1667$, matching the transition reported in the paper.

## 6. What was improved in the reimplementation

- The event logic is separated into the tested `shuttle_model.py` module.
- The two-bus simulation avoids mutable “used” flags and backward scans.
- Results are stored directly as NumPy arrays indexed by bus and trip.
- Parameter sweeps are computed once and reused by multiple plots.
- Divergence is detected before floating-point overflow.
- The return map pairs successive headways of the same bus, as defined in the paper.
- The phase boundary uses a clear RMS regularity criterion and bisection, with the analytical boundary shown for comparison.
- The notebook needs only NumPy and Matplotlib; Pandas, scikit-learn, and tqdm are unnecessary.

## 7. Running the reproduction

Open and run `Reimplementation.ipynb` from top to bottom. The original
`Code.ipynb` is intentionally left unchanged. The new notebook reproduces:

1. headway bifurcation diagrams (Figs. 2–3);
2. tour-time bifurcation diagrams (Figs. 4–5);
3. return maps (Fig. 6);
4. mean and RMS curves (Fig. 7);
5. the regular/nonregular phase boundary (Fig. 8).

Run the numerical checks with:

```bash
python -m unittest -v test_shuttle_model.py
```

The paper uses long transients because convergence becomes very slow close to a transition. Increase `NUM_TRIPS`, `BURN_IN`, and the number of loading samples in the notebook for publication-quality plots.
