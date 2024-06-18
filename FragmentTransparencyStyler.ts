import { Fragment } from 'bim-fragment'
import {
  Component,
  Components,
  FragmentHider,
  FragmentIdMap,
  FragmentManager,
} from 'openbim-components'
import {
  Color,
  InstancedMesh,
  Material,
  Matrix4,
  MeshLambertMaterial,
} from 'three'

export class FragmentTransparencyStyler extends Component<FragmentTransparencyStyler> {
  static readonly uuid = 'e124cf3a-111c-47d7-98ad-11f0d92db181' as const
  public enabled = true
  private hider: FragmentHider
  private manager: FragmentManager
  private transparentFragments: {
    [opacity: number]: { [fragmentId: string]: Fragment }
  } = {}
  private readonly transparentFragmentSuffix = '_transparent_copy'

  constructor(components: Components) {
    super(components)

    components.tools.add(FragmentTransparencyStyler.uuid, this)
    this.hider = components.tools.get(FragmentHider)
    this.manager = components.tools.get(FragmentManager)
  }

  public get(): FragmentTransparencyStyler {
    return this
  }

  public setModelOpacity(opacity: number) {
    for (const fragmentId in this.manager.list) {
      const fragment = this.manager.list[fragmentId]

      fragment.mesh.material.forEach((material) => {
        material.transparent = true
        material.opacity = opacity
        material.needsUpdate = true
      })
    }
  }

  public addOpacity(opacity: number) {
    this.createTransparentFragments(opacity)
  }

  public setOpacityById(opacity: number, fragmentIdMap: FragmentIdMap) {
    // Make the transparent fragments visible.
    for (const fragmentId in fragmentIdMap) {
      this.transparentFragments[opacity][fragmentId].setVisibility(
        true,
        fragmentIdMap[fragmentId],
      )
    }

    // Hide the main items so the transparent ones are visible.
    this.hider.set(false, fragmentIdMap)
  }

  public clearOpacityById(opacity: number, fragmentIdMap: FragmentIdMap) {
    for (const fragmentId in fragmentIdMap) {
      this.transparentFragments[opacity][fragmentId].setVisibility(
        false,
        fragmentIdMap[fragmentId],
      )
    }

    // Show the main fragments.
    this.hider.set(true, fragmentIdMap)
  }

  public disposeOpacity(opacity: number) {
    for (const fragmentId in this.manager.list) {
      const fragment = this.manager.list[fragmentId]
      const transparentFragmentId = fragmentId + this.transparentFragmentSuffix
      const transparentFragment = fragment.fragments[transparentFragmentId]

      if (transparentFragment) {
        fragment.mesh.parent?.remove(transparentFragment.mesh)
        fragment.removeFragment(transparentFragmentId)

        this.transparentFragments[opacity][fragmentId].dispose()
        delete this.transparentFragments[opacity][fragmentId]
      }
    }
  }

  public disposeAllOpacities() {
    for (const opacity in this.transparentFragments) {
      this.disposeOpacity(Number(opacity))
    }
  }

  private createTransparentFragments(opacity: number) {
    if (this.transparentFragments[opacity]) {
      return
    }

    this.transparentFragments[opacity] = {}

    for (const fragmentId in this.manager.list) {
      const fragment = this.manager.list[fragmentId]
      const transparentMaterials = fragment.mesh.material.map((material) =>
        this.copyToTransparentMaterial(material, opacity),
      )
      const transparentFragmentId = fragmentId + this.transparentFragmentSuffix
      const transparentFragment = fragment.addFragment(
        transparentFragmentId,
        transparentMaterials,
      )
      fragment.mesh.parent?.add(transparentFragment.mesh)

      const instanceIdsMap: { [instanceId: number]: Set<string> } = {}

      // @ts-ignore
      for (const item of fragment.items) {
        // @ts-ignore
        const { instanceID } = fragment.getInstanceAndBlockID(item)
        instanceIdsMap[instanceID] = instanceIdsMap[instanceID] ?? new Set()
        instanceIdsMap[instanceID].add(item)
      }

      for (const key in instanceIdsMap) {
        const instanceId = Number(key)
        const matrix = new Matrix4()

        // @ts-ignore
        fragment.getInstance(instanceId, matrix)
        // @ts-ignore
        transparentFragment.setInstance(instanceId, {
          ids: [...instanceIdsMap[instanceId]],
          transform: matrix,
        })
      }

      transparentFragment.mesh.renderOrder = 2
      transparentFragment.mesh.frustumCulled = false

      this.copyInstancedMeshColors(fragment.mesh, transparentFragment.mesh)

      // The transparent fragment is initially hidden.
      transparentFragment.setVisibility(false)
      this.transparentFragments[opacity][fragmentId] = transparentFragment
    }
  }

  private copyToTransparentMaterial(material: Material, opacity: number) {
    const transparentMaterial = new MeshLambertMaterial()
    transparentMaterial.copy(material)
    transparentMaterial.transparent = true
    transparentMaterial.opacity = opacity

    return transparentMaterial
  }

  private copyInstancedMeshColors(
    source: InstancedMesh,
    target: InstancedMesh,
  ) {
    if (source.instanceColor === null) {
      return
    }

    for (let i = 0; i <= target.count; i++) {
      const color = new Color()
      source.getColorAt(i, color)
      target.setColorAt(i, color)
    }
  }
}
