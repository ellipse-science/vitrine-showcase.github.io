import React, { FunctionComponent, memo } from 'react';

import SitePage from '../SitePage/SitePage';
import CategoryHeader from './CategoryHeader/CategoryHeader';
import { ArticlesContextConsumer } from '../../../context/ArticlesContext';
import Category from '../../../models/Category';
import MediaTreemap from '../../medias/MediaTreemap/MediaTreemap';
import UneDesUnes from '../../medias/UneDesUnes/UneDesUnes';
import ConstellationModule from '../../medias/ConstellationModule/ConstellationModule';
import CouverturePartisModule from '../../medias/CouverturePartisModule/CouverturePartisModule';
import MediaTicker from '../MediaTicker/MediaTicker';
import ParoleEnChambre from '../../decideurs/ParoleEnChambre/ParoleEnChambre';
import PartisModule from '../../decideurs/PartisModule/PartisModule';
import EnjuModule from '../../citoyens/EnjuModule/EnjuModule';
import './CategoryPage.scss';

interface CategoryProps {}

const CategoryPage: FunctionComponent<CategoryProps> = () => (
  <ArticlesContextConsumer>
    {({ currentCategory }) =>
      currentCategory ? (
        <SitePage className={`CategoryPage ${currentCategory}`}>
          <section className="CategoryPage-header section-inner">
            <CategoryHeader category={currentCategory} />
          </section>
          {currentCategory === Category.MEDIA && (
            <>
              <MediaTicker />
              <section className="CategoryPage-module section-outer">
                <div className="section-inner">
                  <UneDesUnes />
                </div>
              </section>
              <section className="CategoryPage-module section-outer">
                <div className="section-inner">
                  <MediaTreemap />
                </div>
              </section>
              <section className="CategoryPage-module section-outer">
                <div className="section-inner">
                  <CouverturePartisModule />
                </div>
              </section>
              <section className="CategoryPage-module section-outer">
                <div className="section-inner">
                  <ConstellationModule />
                </div>
              </section>
            </>
          )}
          {currentCategory === Category.AUTHORITIES && (
            <>
              <section className="CategoryPage-module section-outer">
                <div className="section-inner">
                  <ParoleEnChambre />
                </div>
              </section>
              <section className="CategoryPage-module section-outer">
                <div className="section-inner">
                  <PartisModule />
                </div>
              </section>
            </>
          )}
          {currentCategory === Category.PUBLIC_OPINION && (
            <section className="CategoryPage-module section-outer">
              <div className="section-inner">
                <EnjuModule />
              </div>
            </section>
          )}
        </SitePage>
      ) : (
        <></>
      )
    }
  </ArticlesContextConsumer>
);

export default memo(CategoryPage);
