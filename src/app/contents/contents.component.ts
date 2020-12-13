import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore'; // 追加
import axios from 'axios';
import { Chart } from 'chart.js';
import { map } from 'rxjs/operators';

import { environment } from '../../environments/environment.prod';

@Component({
  selector: 'app-contents',
  templateUrl: './contents.component.html',
  styleUrls: ['./contents.component.scss'],
})
export class ContentsComponent implements OnInit {
  // グラフ用変数
  chart;
  // 選ばれた地域を入れる変数
  selectedArea: any;
  // 最後に表示する分別結果
  lastResult: string;
  // 信頼度
  confidence: number;
  // 選択肢を入れる配列
  detailedTags = [];

  // ゴミのタグを入れる変数
  area = {};
  // 地域固有の値を入れる変数
  garbage = {};

  isHidden: boolean = false;
  selectedTag = '';
  imageData;
  isLoaded: boolean = false;
  garbages;

  isFinished: boolean = false;
  isReviewed: boolean = false;
  scores = [];

  // 各地域固有の分別方法の定義
  // 第一の配列は分別方法の定義
  // 第二配列はそれぞれの分別に当てはまるタグがあったときに対してどれくらいのスコアを計上するか
  // 第三配列は各分別の総合得点を定義
  // 第四配列はそれぞれの分別方法の日本語訳 これが最後の画面に出力される

  // 分別種類別スコアについて
  // 例えば資源ごみのスコアの値が高ければ資源ごみに分別される可能性が高いので、そのように分別
  // 各スコアの得点付けはapiから返ってくる値をもとに算出
  // 詳しい算出方法は各処理に記述

  // 分別ごとに加算するスコアが違う点について
  // 平均的に0.4としているのは、tagのconfidenceを参考にしているため
  // tagのconfidenceの高い値は信頼度が高い
  // confidenceと同じような値(0.9程度)を入れると、その信頼度を我々の分析に活かせない
  // ゆえにdescriptionは補助的に利用することにする
  // 高いconfidenceの数値をこのdescriptionが簡単に上回らないように、
  // 高いconfidenceの値の半分程度の値を代入している

  // // 各tagに意味づけをしている
  // // たとえばtrayというキーの中の第一の値であるrecycleはゴミ分別種類を、
  // // 第二の値である"トレイ"は表示選択肢をあらわす
  // // ゴミ分別種類はのちに分別種類別スコアを計上するうえで利用する
  // // 表示選択肢は、そのtagが含まれていれば、分析結果表示後の選択肢として代入するもの
  // // たとえばtrayがtagとして含まれていた時、recycleのスコアに得点が入り、選択肢としてはトレイが代入される
  // // 二つ以上値があるものは、その二つともが処理対象（たとえばcanというtagを選ぶと、空き缶とペットボトルが表示される。スコアも同様）
  // // 三つ目の値は各選択肢に対するゴミ分別方法

  // DI（依存性注入する機能を指定）
  constructor(private db: AngularFirestore) {
    this.garbages = {};
    const docRef = db.collection('garbage');

    docRef
      .valueChanges()
      .pipe(
        map((x) => {
          return x;
        })
      )
      .subscribe((x) => {
        this.area = x[0];
        this.garbages['osaka'] = x[1];
        this.garbages['shibuya'] = x[2];
      });
  }

  ngOnInit(): void {}

  onChangeAreaSelect(): void {
    this.garbage = this.garbages[this.selectedArea];
  }

  onChangeFile(e): void {
    var file = e.target.files[0];
    if (!file) {
      return;
    }
    this.isHidden = true;
    this.detailedTags = [];
    // // 選択したファイルのイメージを表示する
    var reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      this.imageData = e.target.result;
      this.isLoaded = true;
    };

    var file_reader = new FileReader();
    file_reader.readAsArrayBuffer(file);
    file_reader.onload = async (e) => {
      const MY_DOMAIN = environment.azure.AZURE_API_DOMAIN;
      const MY_SUBSCRIPTION_KEY = environment.azure.AZURE_SUBSCRIPTION_KEY;
      const contents = e.target.result;
      new URLSearchParams();
      const params = {
        // Request parameters
        visualFeatures: 'Tags,Categories,Description',
        language: 'en',
      };
      const urlParams = new URLSearchParams(params);
      const url = `https://${MY_DOMAIN}/vision/v3.0/analyze?${urlParams}`;
      const config = {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Ocp-Apim-Subscription-Key': MY_SUBSCRIPTION_KEY,
        },
      };
      const data = await axios
        .post(url, contents, config)
        .then((response) => {
          console.log(response);
          return response.data;
        })
        .catch((e) => {
          console.error(e);
          alert('error');
        });
      // 全てのスコアをゼロにする
      this.scores = [];
      this.area[this.selectedArea].forEach((area) => {
        this.scores.push({
          name: area.name,
          score: 0,
          jpn: area.jpn,
        });
      });
      this.getTags(data);
      this.getDescription(data);
      this.getCaptions(data);
      this.getCategories(data);
      // 計上したスコアを比較、最も高いものを分析結果として表示
      var sum = function (arr) {
        return arr.reduce(function (prev, current) {
          return prev + current;
        });
      };
      var confSum = sum(this.scores.map((score) => score.score));
      var check = Math.max.apply(
        null,
        this.scores.map((score) => score.score)
      );
      this.confidence = (check / confSum) * 100;
      this.confidence = Math.floor(this.confidence);
      this.lastResult = this.scores.find((score) => score.score === check).jpn;

      this.createGraph();
      this.isFinished = true;
    };
  }

  onClickBtnSuccess(e): void {
    if (!this.selectedTag) {
      alert('再分析するには、まず選択肢を選んでください');
      return;
    }
    if (this.selectedTag == 'わからない') {
      alert(
        'すみませんが、このゴミに関してはお力になれません。地域の環境局に電話してみてください。'
      );
      return;
    }
    this.createReview(this.selectedTag);
    this.isReviewed = true;
  }

  checkIfAreaIsSelected(): void {
    if (this.selectedArea === 'default') {
      alert('先に地域を入力してください');
      return;
    }
    // $('#file').click();
  }

  getTags(data) {
    // tagsの処理
    // apiから返ってくるtagsという配列の値を利用してスコア付けをする
    data.tags.forEach((tag) => {
      // garbage配列にないものはfor文をスキップする
      if (this.garbage[tag.name] == undefined) {
        return;
      }
      // tagsにはそれぞれの分析結果に対してconfidenceが存在する
      this.garbage[tag.name].sortings.forEach((sorting, i, array) => {
        // confidenceをlengthで割る
        // 複数カテゴリーにまたがるtagに対して、その影響を相対的に小さくするための数値
        // たとえば、plasticは三種類ものゴミの可能性があるタグに対し、
        // newspaperはほぼ古紙・衣類に分別される
        // 得点のかさみ付けをしなければ、plasticはnewspaperと「同じ重さの」スコアを複数カテゴリーにばらまくことになる
        // 結果として、plasticがなんらかの間違いで新聞の画像に入っていた場合、
        // ４種類の分別種類スコアが近しい点数を示す可能性が存在することになる
        // それを避けるために、点数のかさみ付けをする
        const score = tag.confidence / array.length;
        this.scores.find((sort) => sort.name === sorting).score += score;
      });
      // 抽出されたタグに対して、分析結果後表示する選択肢を配列に入れる
      this.garbage[tag.name].options.forEach((option) => {
        if (!this.detailedTags.includes(option.option)) {
          this.detailedTags.push(option.option);
        }
      });
    });
  }

  // descriptionの処理
  // descriptionについても、処理内容はtagsと同様
  // 異なる点は、ゴミのtagが検出された際、confidenceでなく、
  // それぞれ固有の値を入れる点
  // 固有の値はareaに入っている配列を参照する
  getDescription(data) {
    data.description.tags.forEach((tag) => {
      if (this.garbage[tag] == undefined) {
        return;
      }
      this.garbage[tag].sortings.forEach((sorting, i, array) => {
        const score =
          this.area[this.selectedArea].find((sort) => sort.name === sorting)
            .confidence / array.length;
        this.scores.find((score) => score.name === sorting).score += score;
      });
      // 抽出されたタグに対して、分析結果後表示する選択肢を配列に入れる
      this.garbage[tag].options.forEach((option) => {
        if (!this.detailedTags.includes(option.option)) {
          this.detailedTags.push(option.option);
        }
      });
    });
  }

  getCaptions(data) {
    // descriptionのcaptionの処理
    // captionをスペースで区切り、分析している
    // 分析方法は上記二つとほぼ同様
    if (typeof data.description.captions[0] !== 'undefined') {
      var str = data.description.captions[0].text;
      var result = str.split(' ');
      result.forEach((res) => {
        if (this.garbage[res] == undefined) {
          return;
        }
        this.garbage[res].sortings.forEach((sorting, i, array) => {
          const score =
            this.area[this.selectedArea].find((sort) => sort.name === sorting)
              .confidence / array.length;
          this.scores.find((score) => score.name === sorting).score += score;
        });

        this.garbage[res].options.forEach((option) => {
          if (!this.detailedTags.includes(option.option)) {
            this.detailedTags.push(option.option);
          }
        });
      });
    }
  }

  getCategories(data) {
    // カテゴリーについても分析している
    // 分析方法は同様
    // ただしカテゴリーは複数種類にまたがるtagは存在しない
    // また出現する値としてはdrink_canのようにそのものずばりなものが多いため、
    // 計上するスコアも高くしている
    // ただし処理の実行頻度は高くなく、削っても良いとは考える
    data.categories.forEach((category) => {
      if (this.garbage[category.name] == undefined) {
        return;
      }
      this.garbage[category.name].sortings.forEach((sorting) => {
        const score =
          this.area[this.selectedArea].find((sort) => sort.name === sorting)
            .confidence * 2;
        this.scores.find((score) => score.name === sorting).score += score;
      });
    });
  }

  createGraph() {
    // グラフ作成部
    // グラフに表示するデータ部分
    var mydata = {
      labels: this.area[this.selectedArea].map((area) => area.jpn),
      datasets: [
        {
          hoverBackgroundColor: 'rgba(255,99,132,0.3)',
          data: this.scores.map((score) => score.score),
        },
      ],
    };
    // $('.chartjs-hidden-iframe').remove();
    // オプション設定
    const options = {
      title: {
        display: true,
        text: 'ゴミ種類別スコア',
      },
      legend: {
        display: false,
      },
    };
    const canvas: any = document.getElementById('stage');
    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new Chart(canvas, {
      type: 'bar', //グラフの種類
      data: mydata, //表示するデータ
      options: options, //オプション設定
    });
  }

  createReview(searchVal) {
    let converted;
    Object.keys(this.garbage).forEach((key) => {
      this.garbage[key].options.forEach((option) => {
        if (option.option === searchVal) {
          converted = option.sorting;
        }
      });
    });
    this.lastResult = this.area[this.selectedArea].find(
      (area) => area.name === converted
    ).jpn;
  }
}
