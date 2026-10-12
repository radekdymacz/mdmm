# 13. Technical information, MKI vs MKII
<!-- summary: The limits of the machine as the editor keeps them, and where the editor differs for the MKI and MKII models. -->

## SPECIFICATIONS
<!-- rows: MD-207 @7f78c7 -->

The editor keeps to the limits of the machine. It refuses what the machine cannot hold, and says why.

| Item | Limit |
|---|---|
| Tracks | 16 |
| Patterns | 128, in 8 banks of 16 |
| Pattern length | 16, 32, 48 or 64 steps |
| Kits | 64 |
| Songs | 32, of up to 256 rows each |
| Globals | 8 |
| Parameter locks | 64 locked parameters in a pattern |
| Sample slots | 48 ROM slots and 4 RAM slots |

![The limits as the editor shows them](shot:e2e-md-limits)

## DIFFERENCES BETWEEN THE MKI AND MKII MODELS
<!-- rows: MD-208 MD-209 MD-210 @a63b4f -->

### Pattern length

The MKII model holds patterns of up to 64 steps. The editor offers these lengths.

{gap:MD-208}The editor does not offer the MKI model, whose patterns are 32 steps long at most.{/gap}

### Sampler specifications

The editor's Sampler has 48 ROM slots and 4 RAM slots.

{gap:MD-209}The MKI model has 32 sample slots. The editor offers the MKII model only.{/gap}

### Design

The MKI machine is silver, the MKII black. The editor gives its panel either colour. Click **MKI** or **MKII** in the top bar to switch.

![The plate key in the top bar](shot:e2e-md-top-plate)
 The choice is kept for the next time. It changes the colour only.
