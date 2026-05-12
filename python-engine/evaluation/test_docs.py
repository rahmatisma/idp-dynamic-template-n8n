"""
evaluation/test_docs.py
-------------------------
Visualisasi hasil evaluasi: 4 panel chart disimpan sebagai PNG.
"""

import logging

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from pathlib import Path

log = logging.getLogger(__name__)

# Palet warna konsisten
C_BASE = "#4C72B0"   # biru
C_FT   = "#DD8452"   # oranye


def create_report(df_res: pd.DataFrame, cer_base_mean: float, cer_ft_mean: float, out_png: Path) -> None:
    """
    Buat evaluation_report.png dengan 4 panel:
      1. Bar chart    — CER rata-rata Base vs Fine-tuned
      2. Histogram    — distribusi CER per crop (overlay, density)
      3. Box plot     — perbandingan distribusi CER
      4. Line chart   — CER per sampel diurutkan ascending + area fill
    """
    cer_base = df_res["cer_base"].dropna().values
    cer_ft   = df_res["cer_finetuned"].dropna().values

    fig = plt.figure(figsize=(16, 12))
    fig.patch.set_facecolor("#F8F9FA")
    gs  = gridspec.GridSpec(2, 2, figure=fig, hspace=0.40, wspace=0.35)

    ax1 = fig.add_subplot(gs[0, 0])
    ax2 = fig.add_subplot(gs[0, 1])
    ax3 = fig.add_subplot(gs[1, 0])
    ax4 = fig.add_subplot(gs[1, 1])

    for ax in [ax1, ax2, ax3, ax4]:
        ax.set_facecolor("#FFFFFF")
        for spine in ax.spines.values():
            spine.set_edgecolor("#DDDDDD")
        ax.tick_params(colors="#444444", labelsize=9)

    _plot_bar(ax1, cer_base_mean, cer_ft_mean)
    _plot_histogram(ax2, cer_base, cer_ft, cer_base_mean, cer_ft_mean)
    _plot_boxplot(ax3, cer_base, cer_ft)
    _plot_line(ax4, df_res)

    improvement = (
        (cer_base_mean - cer_ft_mean) / cer_base_mean * 100
        if cer_base_mean > 0 else 0.0
    )
    n_valid = int((df_res["cer_base"].notna() & df_res["cer_finetuned"].notna()).sum())
    fig.suptitle(
        f"Evaluasi TrOCR — {n_valid} sampel  |  "
        f"Base CER: {cer_base_mean:.4f}  |  Fine-tuned CER: {cer_ft_mean:.4f}  |  "
        f"Improvement: {improvement:+.1f}%",
        fontsize=13, fontweight="bold", color="#222222", y=0.98,
    )

    plt.savefig(out_png, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    log.info(f"Visualisasi disimpan: {out_png}")


# ── Panel helpers ──────────────────────────────────────────────────────────────

def _plot_bar(ax, cer_base_mean: float, cer_ft_mean: float) -> None:
    improvement = (
        (cer_base_mean - cer_ft_mean) / cer_base_mean * 100
        if cer_base_mean > 0 else 0.0
    )
    bars = ax.bar(
        ["Base Model", "Fine-tuned"],
        [cer_base_mean, cer_ft_mean],
        color=[C_BASE, C_FT], width=0.45, edgecolor="white", linewidth=1.2,
    )
    for bar, val in zip(bars, [cer_base_mean, cer_ft_mean]):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.005,
            f"{val:.4f}",
            ha="center", va="bottom", fontsize=10, fontweight="bold", color="#333333",
        )
    ax.set_title("CER Rata-rata: Base vs Fine-tuned", fontsize=12, fontweight="bold", pad=10)
    ax.set_ylabel("Character Error Rate (CER)", fontsize=9)
    ax.set_ylim(0, max(cer_base_mean, cer_ft_mean) * 1.30 + 0.01)
    ax.yaxis.grid(True, linestyle="--", alpha=0.5, color="#CCCCCC")
    ax.set_axisbelow(True)
    ax.text(
        0.98, 0.95,
        f"Improvement: {improvement:+.1f}%",
        transform=ax.transAxes, ha="right", va="top", fontsize=9, fontweight="bold",
        color="#2ECC71" if improvement > 0 else "#E74C3C",
        bbox=dict(boxstyle="round,pad=0.3",
                  facecolor="#F0FFF0" if improvement > 0 else "#FFF0F0",
                  edgecolor="#CCCCCC", alpha=0.9),
    )


def _plot_histogram(ax, cer_base, cer_ft, cer_base_mean, cer_ft_mean) -> None:
    bins = np.linspace(0, 1, 41)
    ax.hist(cer_base, bins=bins, alpha=0.55, color=C_BASE,
            label=f"Base (μ={cer_base_mean:.4f})", density=True)
    ax.hist(cer_ft,   bins=bins, alpha=0.55, color=C_FT,
            label=f"Fine-tuned (μ={cer_ft_mean:.4f})", density=True)
    ax.axvline(cer_base_mean, color=C_BASE, linestyle="--", linewidth=1.5, alpha=0.9)
    ax.axvline(cer_ft_mean,   color=C_FT,   linestyle="--", linewidth=1.5, alpha=0.9)
    ax.set_title("Distribusi CER per Crop", fontsize=12, fontweight="bold", pad=10)
    ax.set_xlabel("CER", fontsize=9)
    ax.set_ylabel("Densitas", fontsize=9)
    ax.legend(fontsize=8, framealpha=0.85)
    ax.yaxis.grid(True, linestyle="--", alpha=0.4, color="#CCCCCC")
    ax.set_axisbelow(True)


def _plot_boxplot(ax, cer_base, cer_ft) -> None:
    bp = ax.boxplot(
        [cer_base, cer_ft],
        labels=["Base", "Fine-tuned"],
        patch_artist=True,
        medianprops=dict(color="#333333", linewidth=2),
        flierprops=dict(marker="o", markersize=3, alpha=0.4),
        widths=0.4,
    )
    for patch, color in zip(bp["boxes"], [C_BASE, C_FT]):
        patch.set_facecolor(color)
        patch.set_alpha(0.7)
    for whisker in bp["whiskers"]:
        whisker.set_color("#888888")
    for cap in bp["caps"]:
        cap.set_color("#888888")
    for flier, color in zip(bp["fliers"], [C_BASE, C_FT]):
        flier.set_markerfacecolor(color)
        flier.set_markeredgecolor(color)
    ax.set_title("Box Plot Distribusi CER", fontsize=12, fontweight="bold", pad=10)
    ax.set_ylabel("CER", fontsize=9)
    ax.yaxis.grid(True, linestyle="--", alpha=0.4, color="#CCCCCC")
    ax.set_axisbelow(True)


def _plot_line(ax, df_res: pd.DataFrame) -> None:
    mask = df_res["cer_base"].notna() & df_res["cer_finetuned"].notna()
    cer_base_v = df_res.loc[mask, "cer_base"].values
    cer_ft_v   = df_res.loc[mask, "cer_finetuned"].values

    sort_idx = np.argsort(cer_base_v)
    x = np.arange(len(sort_idx))

    ax.plot(x, cer_base_v[sort_idx], color=C_BASE, linewidth=0.9, alpha=0.8, label="Base")
    ax.plot(x, cer_ft_v[sort_idx],   color=C_FT,   linewidth=0.9, alpha=0.8, label="Fine-tuned")
    ax.fill_between(x, cer_base_v[sort_idx], cer_ft_v[sort_idx],
                    where=cer_ft_v[sort_idx] < cer_base_v[sort_idx],
                    alpha=0.15, color="#2ECC71", label="Fine-tuned lebih baik")
    ax.fill_between(x, cer_base_v[sort_idx], cer_ft_v[sort_idx],
                    where=cer_ft_v[sort_idx] >= cer_base_v[sort_idx],
                    alpha=0.15, color="#E74C3C", label="Base lebih baik")
    ax.set_title("CER per Sampel (urut ascending)", fontsize=12, fontweight="bold", pad=10)
    ax.set_xlabel("Indeks Sampel (diurutkan)", fontsize=9)
    ax.set_ylabel("CER", fontsize=9)
    ax.legend(fontsize=7.5, framealpha=0.85, ncol=2)
    ax.yaxis.grid(True, linestyle="--", alpha=0.4, color="#CCCCCC")
    ax.set_axisbelow(True)
