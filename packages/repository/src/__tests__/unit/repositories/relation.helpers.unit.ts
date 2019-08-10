// Copyright IBM Corp. 2019. All Rights Reserved.
// Node module: @loopback/repository
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {expect, toJSON} from '@loopback/testlab';
import {
  DefaultCrudRepository,
  findByForeignKeys,
  includeRelatedModels,
  juggler,
} from '../../..';
import {model, property} from '../../../decorators';
import {Entity} from '../../../model';
import {
  belongsTo,
  BelongsToAccessor,
  Getter,
  hasMany,
  HasManyRepositoryFactory,
  InclusionResolver,
} from '../../../relations';

describe('relation helpers', () => {
  describe('findByForeignKeys', () => {
    let productRepo: ProductRepository;

    before(() => {
      productRepo = new ProductRepository(testdb);
    });

    beforeEach(async () => {
      await productRepo.deleteAll();
    });

    it('returns an empty array when no foreign keys are passed in', async () => {
      const fkIds: number[] = [];
      await productRepo.create({id: 1, name: 'product', categoryId: 1});
      const products = await findByForeignKeys(
        productRepo,
        'categoryId',
        fkIds,
      );
      expect(products).to.be.empty();
    });

    it('returns an empty array when no instances have the foreign key value', async () => {
      await productRepo.create({id: 1, name: 'product', categoryId: 1});
      const products = await findByForeignKeys(productRepo, 'categoryId', 2);
      expect(products).to.be.empty();
    });

    it('returns an empty array when no instances have the foreign key values', async () => {
      await productRepo.create({id: 1, name: 'product', categoryId: 1});
      const products = await findByForeignKeys(productRepo, 'categoryId', [
        2,
        3,
      ]);
      expect(products).to.be.empty();
    });

    it('returns all instances that have the foreign key value', async () => {
      const pens = await productRepo.create({name: 'pens', categoryId: 1});
      const pencils = await productRepo.create({
        name: 'pencils',
        categoryId: 1,
      });
      const products = await findByForeignKeys(productRepo, 'categoryId', 1);
      expect(products).to.deepEqual([pens, pencils]);
    });

    it('does not include instances with different foreign key values', async () => {
      const pens = await productRepo.create({name: 'pens', categoryId: 1});
      const pencils = await productRepo.create({
        name: 'pencils',
        categoryId: 2,
      });
      const products = await findByForeignKeys(productRepo, 'categoryId', 1);
      expect(products).to.deepEqual([pens]);
      expect(products).to.not.containDeep(pencils);
    });

    it('includes instances when there is one value in the array of foreign key values', async () => {
      const pens = await productRepo.create({name: 'pens', categoryId: 1});
      const pencils = await productRepo.create({
        name: 'pencils',
        categoryId: 2,
      });
      const products = await findByForeignKeys(productRepo, 'categoryId', [2]);
      expect(products).to.deepEqual([pencils]);
      expect(products).to.not.containDeep(pens);
    });

    it('returns all instances that have any of multiple foreign key values', async () => {
      const pens = await productRepo.create({name: 'pens', categoryId: 1});
      const pencils = await productRepo.create({
        name: 'pencils',
        categoryId: 2,
      });
      const paper = await productRepo.create({name: 'paper', categoryId: 3});
      const products = await findByForeignKeys(productRepo, 'categoryId', [
        1,
        3,
      ]);
      expect(products).to.deepEqual([pens, paper]);
      expect(products).to.not.containDeep(pencils);
    });

    it('throws error if scope is passed in and is non-empty', async () => {
      let errorMessage;
      try {
        await findByForeignKeys(productRepo, 'categoryId', [1], {
          limit: 1,
        });
      } catch (error) {
        errorMessage = error.message;
      }
      expect(errorMessage).to.eql('scope is not supported');
    });

    it('does not throw an error if scope is passed in and is undefined or empty', async () => {
      let products = await findByForeignKeys(
        productRepo,
        'categoryId',
        [1],
        undefined,
        {},
      );
      expect(products).to.be.empty();
      products = await findByForeignKeys(productRepo, 'categoryId', 1, {}, {});
      expect(products).to.be.empty();
    });
  });

  describe('includeRelatedModels', () => {
    let productRepo: ProductRepository;
    let categoryRepo: CategoryRepository;

    before(() => {
      productRepo = new ProductRepository(testdb);
      categoryRepo = new CategoryRepository(testdb, async () => productRepo);
    });

    beforeEach(async () => {
      await productRepo.deleteAll();
      await categoryRepo.deleteAll();
    });

    it('returns source model if no filter is passed in', async () => {
      const category = await categoryRepo.create({name: 'category 1'});
      await categoryRepo.create({name: 'category 2'});
      const result = await includeRelatedModels(categoryRepo, [category]);
      expect(result).to.eql([category]);
    });

    it('throws error if the target repository does not have a registered relation', async () => {
      let errorMessage, errorCode;
      try {
        await productRepo.create({id: 1, name: 'product1', categoryId: 1});
        await includeRelatedModels(categoryRepo, [], {
          include: [{relation: 'products'}],
        });
      } catch (error) {
        errorCode = error.code;
        errorMessage = error.message;
      }
      expect(errorCode).to.eql('INVALID_INCLUSION_FILTER');
      expect(errorMessage).to.eql(
        'Invalid "filter.include" entries: {"relation":"products"}',
      );
    });

    it('returns an empty array if target model if the source entity does not have any related models', async () => {
      const category = await categoryRepo.create({name: 'category'});
      const resolver: InclusionResolver = async entities => {
        const c = entities[0] as Category;
        const product: Product[] = await categoryRepo.products(c.id).find();
        return [product];
      };

      // eslint-disable-next-line require-atomic-updates
      categoryRepo.inclusionResolvers = new Map<string, InclusionResolver>();
      categoryRepo.inclusionResolvers.set('products', resolver);

      const categories = await includeRelatedModels(categoryRepo, [category], {
        include: [{relation: 'products'}],
      });

      expect(categories[0].products).to.be.empty();
    });

    it('includes related model for one instance - belongsTo', async () => {
      const category = await categoryRepo.create({name: 'category'});
      const product = await productRepo.create({
        name: 'product',
        categoryId: category.id,
      });

      const resolver: InclusionResolver = async entities => {
        const p = entities[0] as Product;
        const categories: Category[] = [
          await categoryRepo.findById(p.categoryId),
        ];

        return categories;
      };

      // eslint-disable-next-line require-atomic-updates
      productRepo.inclusionResolvers = new Map<string, InclusionResolver>();
      productRepo.inclusionResolvers.set('category', resolver);

      const productWithCategories = await includeRelatedModels(
        productRepo,
        [product],
        {
          include: [{relation: 'category'}],
        },
      );

      expect(toJSON(productWithCategories)).to.deepEqual([
        {...toJSON(product), category: toJSON(category)},
      ]);
    });

    it('includes related model for more than one instance - belongsTo', async () => {
      const categoryOne = await categoryRepo.create({name: 'category 1'});
      const productOne = await productRepo.create({
        name: 'product 1',
        categoryId: categoryOne.id,
      });

      const categoryTwo = await categoryRepo.create({name: 'category 2'});
      const productTwo = await productRepo.create({
        name: 'product 2',
        categoryId: categoryTwo.id,
      });

      const productThree = await productRepo.create({
        name: 'product 3',
        categoryId: categoryTwo.id,
      });

      const resolver: InclusionResolver = async entities => {
        const categories: Category[] = [];

        for (const entity of entities) {
          const p = entity as Product;
          const c = await categoryRepo.findById(p.categoryId);
          categories.push(c);
        }

        return categories;
      };

      // eslint-disable-next-line require-atomic-updates
      productRepo.inclusionResolvers = new Map<string, InclusionResolver>();
      productRepo.inclusionResolvers.set('category', resolver);

      const productWithCategories = await includeRelatedModels(
        productRepo,
        [productOne, productTwo, productThree],
        {
          include: [{relation: 'category'}],
        },
      );

      expect(toJSON(productWithCategories)).to.deepEqual([
        {...toJSON(productOne), category: toJSON(categoryOne)},
        {...toJSON(productTwo), category: toJSON(categoryTwo)},
        {...toJSON(productThree), category: toJSON(categoryTwo)},
      ]);
    });

    it('includes related models for one instance - hasMany', async () => {
      const category = await categoryRepo.create({name: 'category'});
      const productOne = await productRepo.create({
        name: 'product 1',
        categoryId: category.id,
      });

      const productTwo = await productRepo.create({
        name: 'product 2',
        categoryId: category.id,
      });

      const resolver: InclusionResolver = async entities => {
        let products: Product[] = [];

        for (const entity of entities) {
          const c = entity as Category;
          products = await categoryRepo.products(c.id).find();
        }
        return [products];
      };

      // eslint-disable-next-line require-atomic-updates
      categoryRepo.inclusionResolvers = new Map<string, InclusionResolver>();
      categoryRepo.inclusionResolvers.set('products', resolver);

      const categoryWithProducts = await includeRelatedModels(
        categoryRepo,
        [category],
        {include: [{relation: 'products'}]},
      );

      expect(toJSON(categoryWithProducts)).to.deepEqual([
        {
          ...toJSON(category),
          products: [toJSON(productOne), toJSON(productTwo)],
        },
      ]);
    });

    it('includes related models for more than one instance - hasMany', async () => {
      const categoryOne = await categoryRepo.create({name: 'category 1'});
      const productOne = await productRepo.create({
        name: 'product 1',
        categoryId: categoryOne.id,
      });

      const categoryTwo = await categoryRepo.create({name: 'category 2'});
      const productTwo = await productRepo.create({
        name: 'product 2',
        categoryId: categoryTwo.id,
      });

      const categoryThree = await categoryRepo.create({name: 'category 3'});
      const productThree = await productRepo.create({
        name: 'product 3',
        categoryId: categoryTwo.id,
      });

      const resolver: InclusionResolver = async entities => {
        const products: Product[][] = [];

        for (const entity of entities) {
          const c = entity as Category;
          const p = await categoryRepo.products(c.id).find();
          products.push(p);
        }
        return products;
      };

      // eslint-disable-next-line require-atomic-updates
      categoryRepo.inclusionResolvers = new Map<string, InclusionResolver>();
      categoryRepo.inclusionResolvers.set('products', resolver);

      const categoryWithProducts = await includeRelatedModels(
        categoryRepo,
        [categoryOne, categoryTwo, categoryThree],
        {include: [{relation: 'products'}]},
      );

      expect(toJSON(categoryWithProducts)).to.deepEqual([
        {...toJSON(categoryOne), products: [toJSON(productOne)]},
        {
          ...toJSON(categoryTwo),
          products: [toJSON(productTwo), toJSON(productThree)],
        },
        {...toJSON(categoryThree), products: []},
      ]);
    });
  });

  /******************* HELPERS *******************/

  @model()
  class Product extends Entity {
    @property({id: true})
    id: number;
    @property()
    name: string;
    @belongsTo(() => Category)
    categoryId: number;
  }

  class ProductRepository extends DefaultCrudRepository<
    Product,
    typeof Product.prototype.id
  > {
    public readonly category: BelongsToAccessor<
      Category,
      typeof Product.prototype.id
    >;
    constructor(
      dataSource: juggler.DataSource,
      categoryRepo?: Getter<CategoryRepository>,
    ) {
      super(Product, dataSource);
      if (categoryRepo)
        this.category = this.createBelongsToAccessorFor(
          'category',
          categoryRepo,
        );
    }
  }

  @model()
  class Category extends Entity {
    @property({id: true})
    id?: number;
    @property()
    name: string;
    @hasMany(() => Product, {keyTo: 'categoryId'})
    products?: Product[];
  }
  interface CategoryRelations {
    products?: Product[];
  }

  class CategoryRepository extends DefaultCrudRepository<
    Category,
    typeof Category.prototype.id,
    CategoryRelations
  > {
    public readonly products: HasManyRepositoryFactory<
      Product,
      typeof Category.prototype.id
    >;
    constructor(
      dataSource: juggler.DataSource,
      productRepo: Getter<ProductRepository>,
    ) {
      super(Category, dataSource);
      this.products = this.createHasManyRepositoryFactoryFor(
        'products',
        productRepo,
      );
    }
  }

  const testdb: juggler.DataSource = new juggler.DataSource({
    name: 'db',
    connector: 'memory',
  });
});
